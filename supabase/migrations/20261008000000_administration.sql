-- Phase 7: schedule administration, historical corrections, and retained deletion.
begin;

-- A date closure also applies to slots added later, without changing each slot's
-- own open/closed state. Reopening a date never reopens individually closed slots.
create table public.schedule_date_closures (
  presentation_date date primary key,
  created_at timestamptz not null default now()
);
alter table public.schedule_date_closures enable row level security;
revoke all on public.schedule_date_closures from public, anon, authenticated;
grant select on public.schedule_date_closures to authenticated;
create policy schedule_date_closures_employee_read on public.schedule_date_closures
  for select to authenticated using (private.current_employee_id() is not null);

alter table public.presentation_slots add column revision integer not null default 1;
create function private.increment_slot_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
revoke all on function private.increment_slot_revision() from public, anon, authenticated;
create trigger presentation_slots_increment_revision before update on public.presentation_slots
for each row execute function private.increment_slot_revision();

create or replace view public.schedule_slots with (security_invoker = true) as
select s.id as slot_id, s.presentation_date, s.slot_number,
  (s.is_open and d.presentation_date is null) as is_open,
  p.id as presentation_id, p.presenter_user_id, u.name as presenter_name,
  p.title, p.description, p.category_id, c.name as category_name, p.reference_url
from public.presentation_slots s
left join public.schedule_date_closures d on d.presentation_date = s.presentation_date
left join public.presentations p on p.slot_id = s.id
  and p.cancelled_at is null and p.deleted_at is null
left join public.users u on u.id = p.presenter_user_id
left join public.categories c on c.id = p.category_id;

-- At this scale a single transaction-scoped advisory lock keeps all app schedule
-- writes ordered, including bookings of slots created while a date is closing.
-- It is always acquired BEFORE category/slot/presentation locks. Existing row locks
-- and the unique active-booking index remain in place. File writes need no schedule
-- lock: they only lock the presentation and recheck permissions after waiting.
create or replace function public.register_presentation(
  p_slot_id uuid,
  p_title text,
  p_category_id uuid default null,
  p_description text default null,
  p_reference_url text default null
)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  -- Match the server’s Unicode whitespace trimming for required/optional fields.
  trim_characters constant text := E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  employee_id uuid;
  chosen_slot public.presentation_slots%rowtype;
  presentation_id uuid;
  clean_title text := nullif(btrim(p_title, trim_characters), '');
  clean_description text := nullif(btrim(p_description, trim_characters), '');
  clean_url text := nullif(btrim(p_reference_url, trim_characters), '');
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  employee_id := private.current_employee_id();
  if employee_id is null then
    raise exception using errcode = '42501', message = 'employee_access_required';
  end if;
  if clean_title is null then
    raise exception using errcode = '23514', message = 'title_required';
  end if;
  if char_length(clean_description) > 500 then
    raise exception using errcode = '23514', message = 'description_too_long';
  end if;
  -- The server also parses URLs. This independently restricts direct RPC input to
  -- absolute HTTP(S) links with a host and no credentials, whitespace or backslashes.
  if clean_url is not null and clean_url !~* '^https?://([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:.]+\])(:[0-9]{1,5})?([/?#][^[:space:]\\]*)?$' then
    raise exception using errcode = '23514', message = 'invalid_reference_url';
  end if;
  if p_category_id is not null then
    perform 1 from public.categories where id = p_category_id and is_active for share;
    if not found then
      raise exception using errcode = '23514', message = 'category_unavailable';
    end if;
  end if;

  -- All bookings of a slot serialize here, including with an administrator closing
  -- or moving the slot. The unique partial index remains the final duplicate guard.
  select * into chosen_slot from public.presentation_slots where id = p_slot_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'slot_not_found';
  end if;
  -- Recheck membership and wall-clock date AFTER waiting for the lock. A transaction
  -- that started before Vancouver midnight must not book yesterday after midnight.
  employee_id := private.current_employee_id();
  if employee_id is null then
    raise exception using errcode = '42501', message = 'employee_access_required';
  end if;
  if chosen_slot.presentation_date < (clock_timestamp() at time zone 'America/Vancouver')::date then
    raise exception using errcode = 'P0001', message = 'slot_past';
  end if;
  if not chosen_slot.is_open or exists (
    select 1 from public.schedule_date_closures where presentation_date = chosen_slot.presentation_date
  ) then
    raise exception using errcode = 'P0001', message = 'slot_closed';
  end if;
  if exists (select 1 from public.presentations where slot_id = p_slot_id and cancelled_at is null and deleted_at is null) then
    raise exception using errcode = '23505', message = 'slot_booked';
  end if;

  insert into public.presentations (slot_id, presenter_user_id, title, category_id, description, reference_url)
  values (p_slot_id, employee_id, clean_title, p_category_id, clean_description, clean_url)
  returning id into presentation_id;
  return presentation_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'slot_booked';
end;
$$;

create or replace function private.change_upcoming_presentation(
  p_id uuid, p_revision integer, p_cancel boolean, p_slot_id uuid,
  p_title text, p_category_id uuid, p_description text, p_reference_url text
)
returns uuid language plpgsql volatile set search_path = '' as $$
declare
  trim_characters constant text := E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  employee_id uuid := private.current_employee_id();
  original public.presentations%rowtype;
  current_presentation public.presentations%rowtype;
  source_slot public.presentation_slots%rowtype;
  target_slot public.presentation_slots%rowtype;
  category_active boolean;
  clean_title text := nullif(btrim(p_title, trim_characters), '');
  clean_description text := nullif(btrim(p_description, trim_characters), '');
  clean_url text := nullif(btrim(p_reference_url, trim_characters), '');
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  employee_id := private.current_employee_id();
  if employee_id is null then
    raise exception using errcode = '42501', message = 'employee_access_required';
  end if;
  select * into original from public.presentations where id = p_id;
  if not found or original.deleted_at is not null
    or (original.presenter_user_id <> employee_id and not private.is_admin()) then
    raise exception using errcode = '42501', message = 'presentation_unavailable';
  end if;

  if not p_cancel then
    if clean_title is null then
      raise exception using errcode = '23514', message = 'title_required';
    end if;
    if char_length(clean_description) > 500 then
      raise exception using errcode = '23514', message = 'description_too_long';
    end if;
    if clean_url is not null and clean_url !~* '^https?://([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:.]+\])(:[0-9]{1,5})?([/?#][^[:space:]\\]*)?$' then
      raise exception using errcode = '23514', message = 'invalid_reference_url';
    end if;
    -- Match registration's category-before-slot lock order. An existing inactive
    -- category may be retained, but cannot be newly selected.
    if p_category_id is not null then
      select is_active into category_active from public.categories where id = p_category_id for share;
      if not found then
        raise exception using errcode = '23514', message = 'category_unavailable';
      end if;
    end if;
  end if;

  -- Lock BOTH slots in a consistent order before the presentation. Registration
  -- also locks the slot first. No source booking is released until the whole
  -- update commits, and opposing moves cannot deadlock on reversed slot order.
  perform id from public.presentation_slots
    where id = original.slot_id or (not p_cancel and id = p_slot_id)
    order by id for update;
  select * into current_presentation from public.presentations where id = p_id for update;
  employee_id := private.current_employee_id();
  if employee_id is null then
    raise exception using errcode = '42501', message = 'employee_access_required';
  end if;
  if current_presentation.id is null or current_presentation.deleted_at is not null
    or (current_presentation.presenter_user_id <> employee_id and not private.is_admin()) then
    raise exception using errcode = '42501', message = 'presentation_unavailable';
  end if;
  if current_presentation.revision is distinct from p_revision
    or current_presentation.slot_id <> original.slot_id then
    raise exception using errcode = 'P0001', message = 'presentation_changed';
  end if;
  if current_presentation.cancelled_at is not null then
    raise exception using errcode = 'P0001', message = 'presentation_cancelled';
  end if;
  select * into source_slot from public.presentation_slots where id = current_presentation.slot_id;
  -- Use wall-clock time AFTER lock waits. Historical corrections use the separate administrator RPC.
  if source_slot.presentation_date < (clock_timestamp() at time zone 'America/Vancouver')::date then
    raise exception using errcode = 'P0001', message = 'presentation_completed';
  end if;
  if p_cancel then
    update public.presentations set cancelled_at = clock_timestamp() where id = p_id;
    return p_id;
  end if;

  if p_category_id is not null and not category_active
    and p_category_id is distinct from current_presentation.category_id then
    raise exception using errcode = '23514', message = 'category_unavailable';
  end if;
  select * into target_slot from public.presentation_slots where id = p_slot_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'slot_not_found';
  end if;
  if target_slot.presentation_date < (clock_timestamp() at time zone 'America/Vancouver')::date then
    raise exception using errcode = 'P0001', message = 'slot_past';
  end if;
  if p_slot_id <> current_presentation.slot_id then
    if not target_slot.is_open or exists (
      select 1 from public.schedule_date_closures where presentation_date = target_slot.presentation_date
    ) then
      raise exception using errcode = 'P0001', message = 'slot_closed';
    end if;
    if exists (select 1 from public.presentations where slot_id = p_slot_id and cancelled_at is null and deleted_at is null) then
      raise exception using errcode = '23505', message = 'slot_booked';
    end if;
  end if;
  -- A closed source slot can still have its content edited or be vacated.
  update public.presentations set slot_id = p_slot_id, title = clean_title,
    category_id = p_category_id, description = clean_description, reference_url = clean_url
    where id = p_id;
  return p_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'slot_booked';
end;
$$;
revoke all on function private.change_upcoming_presentation(uuid, integer, boolean, uuid, text, uuid, text, text) from public, anon, authenticated;

-- Admin checks run both before work and after any row-lock wait.
create function private.require_schedule_admin()
returns void language plpgsql volatile set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'admin_access_required';
  end if;
end;
$$;
revoke all on function private.require_schedule_admin() from public, anon, authenticated;

create function public.admin_create_slot(p_date date, p_number integer default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  new_id uuid;
  next_number integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  perform private.require_schedule_admin();
  if p_date is null or not isfinite(p_date) or p_date < date '0001-01-01' or p_date > date '9999-12-31' then
    raise exception using errcode = '23514', message = 'invalid_date';
  end if;
  select coalesce(p_number, coalesce(max(slot_number), 0) + 1) into next_number
    from public.presentation_slots where presentation_date = p_date;
  if next_number < 1 or next_number > 32767 then
    raise exception using errcode = '23514', message = 'invalid_slot_number';
  end if;
  insert into public.presentation_slots(presentation_date, slot_number)
    values (p_date, next_number) returning id into new_id;
  return new_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'slot_number_taken';
end;
$$;

create function public.admin_extend_schedule(p_start date, p_end date)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  added integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  perform private.require_schedule_admin();
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_start < (clock_timestamp() at time zone 'America/Vancouver')::date
    or p_end < p_start or p_end > date '9999-12-31' or p_end - p_start > 366 then
    raise exception using errcode = '23514', message = 'invalid_schedule_range';
  end if;
  -- Only dates with no slots get a new slot. Existing bookings, slot numbering,
  -- per-slot closures, and date closures are all left untouched on repeat runs.
  insert into public.presentation_slots(presentation_date, slot_number)
  select p_start + n, 1 from generate_series(0, p_end - p_start) n
  where extract(isodow from p_start + n) = 2
    and not exists (select 1 from public.presentation_slots s where s.presentation_date = p_start + n)
  on conflict (presentation_date, slot_number) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;

create function public.admin_update_slot(p_id uuid, p_revision integer, p_date date, p_number integer, p_open boolean)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  original public.presentation_slots%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  perform private.require_schedule_admin();
  if p_date is null or not isfinite(p_date) or p_date < date '0001-01-01' or p_date > date '9999-12-31' then
    raise exception using errcode = '23514', message = 'invalid_date';
  end if;
  if p_number is null or p_number < 1 or p_number > 32767 or p_open is null then
    raise exception using errcode = '23514', message = 'invalid_slot_number';
  end if;
  select * into original from public.presentation_slots where id = p_id for update;
  perform private.require_schedule_admin();
  if original.id is null then
    raise exception using errcode = 'P0001', message = 'slot_not_found';
  end if;
  if original.revision is distinct from p_revision then
    raise exception using errcode = 'P0001', message = 'slot_changed';
  end if;
  -- Changing a referenced slot would silently rewrite even retained cancelled or
  -- deleted records. Reschedule presentations explicitly; create a new slot instead.
  if (original.presentation_date <> p_date or original.slot_number <> p_number)
    and exists (select 1 from public.presentations where slot_id = p_id) then
    raise exception using errcode = 'P0001', message = 'slot_has_history';
  end if;
  if not p_open and exists (select 1 from public.presentations where slot_id = p_id and cancelled_at is null and deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'slot_has_booking';
  end if;
  update public.presentation_slots set presentation_date = p_date, slot_number = p_number, is_open = p_open where id = p_id;
  return p_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'slot_number_taken';
end;
$$;

create function public.admin_set_date_closed(p_date date, p_closed boolean, p_expected_closed boolean)
returns date language plpgsql volatile security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  perform private.require_schedule_admin();
  if p_date is null or not isfinite(p_date) or p_date < date '0001-01-01' or p_date > date '9999-12-31'
    or p_closed is null or p_expected_closed is null then
    raise exception using errcode = '23514', message = 'invalid_date';
  end if;
  perform id from public.presentation_slots where presentation_date = p_date order by id for update;
  perform private.require_schedule_admin();
  if exists (select 1 from public.schedule_date_closures where presentation_date = p_date) is distinct from p_expected_closed then
    raise exception using errcode = 'P0001', message = 'date_changed';
  end if;
  if p_closed then
    if exists (select 1 from public.presentations p join public.presentation_slots s on s.id = p.slot_id
      where s.presentation_date = p_date and p.cancelled_at is null and p.deleted_at is null) then
      raise exception using errcode = 'P0001', message = 'date_has_bookings';
    end if;
    insert into public.schedule_date_closures(presentation_date) values (p_date) on conflict do nothing;
  else
    delete from public.schedule_date_closures where presentation_date = p_date;
  end if;
  return p_date;
end;
$$;

create function public.admin_update_presentation(
  p_id uuid, p_revision integer, p_slot_id uuid, p_presenter_id uuid, p_title text,
  p_category_id uuid default null, p_description text default null, p_reference_url text default null
)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  trim_characters constant text := E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  original public.presentations%rowtype;
  current_presentation public.presentations%rowtype;
  target public.presentation_slots%rowtype;
  clean_title text := nullif(btrim(p_title, trim_characters), '');
  clean_description text := nullif(btrim(p_description, trim_characters), '');
  clean_url text := nullif(btrim(p_reference_url, trim_characters), '');
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  perform private.require_schedule_admin();
  select * into original from public.presentations where id = p_id and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'presentation_unavailable';
  end if;
  if clean_title is null then
    raise exception using errcode = '23514', message = 'title_required';
  end if;
  if char_length(clean_description) > 500 then
    raise exception using errcode = '23514', message = 'description_too_long';
  end if;
  if clean_url is not null and clean_url !~* '^https?://([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:.]+\])(:[0-9]{1,5})?([/?#][^[:space:]\\]*)?$' then
    raise exception using errcode = '23514', message = 'invalid_reference_url';
  end if;
  if p_category_id is not null then
    perform 1 from public.categories where id = p_category_id for share;
    if not found then
      raise exception using errcode = '23514', message = 'category_unavailable';
    end if;
  end if;
  -- Former employees and inactive categories remain valid historical metadata.
  perform 1 from public.users where id = p_presenter_id for key share;
  if not found then
    raise exception using errcode = '23514', message = 'presenter_unavailable';
  end if;
  perform id from public.presentation_slots where id in (original.slot_id, p_slot_id) order by id for update;
  select * into current_presentation from public.presentations where id = p_id for update;
  perform private.require_schedule_admin();
  if current_presentation.id is null or current_presentation.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'presentation_unavailable';
  end if;
  if current_presentation.revision is distinct from p_revision or current_presentation.slot_id <> original.slot_id then
    raise exception using errcode = 'P0001', message = 'presentation_changed';
  end if;
  select * into target from public.presentation_slots where id = p_slot_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'slot_not_found';
  end if;
  if p_slot_id <> current_presentation.slot_id and current_presentation.cancelled_at is null then
    if not target.is_open or exists (select 1 from public.schedule_date_closures where presentation_date = target.presentation_date) then
      raise exception using errcode = 'P0001', message = 'slot_closed';
    end if;
    if exists (select 1 from public.presentations where slot_id = p_slot_id and cancelled_at is null and deleted_at is null) then
      raise exception using errcode = '23505', message = 'slot_booked';
    end if;
  end if;
  update public.presentations set slot_id = p_slot_id, presenter_user_id = p_presenter_id,
    title = clean_title, category_id = p_category_id, description = clean_description, reference_url = clean_url where id = p_id;
  return p_id;
end;
$$;

create function public.admin_remove_presentation(p_id uuid, p_revision integer, p_operation text, p_confirm boolean default false)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  original_slot uuid;
  current_presentation public.presentations%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  perform private.require_schedule_admin();
  if p_operation is null or p_operation not in ('cancel', 'delete') or p_confirm is distinct from true then
    raise exception using errcode = '23514', message = 'confirmation_required';
  end if;
  select slot_id into original_slot from public.presentations where id = p_id and deleted_at is null;
  perform id from public.presentation_slots where id = original_slot for update;
  select * into current_presentation from public.presentations where id = p_id for update;
  perform private.require_schedule_admin();
  if current_presentation.id is null or current_presentation.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'presentation_unavailable';
  end if;
  if current_presentation.revision is distinct from p_revision or current_presentation.slot_id <> original_slot then
    raise exception using errcode = 'P0001', message = 'presentation_changed';
  end if;
  if p_operation = 'cancel' then
    if current_presentation.cancelled_at is not null then
      raise exception using errcode = 'P0001', message = 'presentation_cancelled';
    end if;
    update public.presentations set cancelled_at = clock_timestamp() where id = p_id;
  else
    update public.presentations set deleted_at = clock_timestamp() where id = p_id;
  end if;
  -- No slot state, file metadata, upload intents, or Storage objects are removed.
  return p_id;
end;
$$;

revoke all on function public.admin_create_slot(date, integer) from public, anon, authenticated;
revoke all on function public.admin_extend_schedule(date, date) from public, anon, authenticated;
revoke all on function public.admin_update_slot(uuid, integer, date, integer, boolean) from public, anon, authenticated;
revoke all on function public.admin_set_date_closed(date, boolean, boolean) from public, anon, authenticated;
revoke all on function public.admin_update_presentation(uuid, integer, uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_remove_presentation(uuid, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_create_slot(date, integer) to authenticated;
grant execute on function public.admin_extend_schedule(date, date) to authenticated;
grant execute on function public.admin_update_slot(uuid, integer, date, integer, boolean) to authenticated;
grant execute on function public.admin_set_date_closed(date, boolean, boolean) to authenticated;
grant execute on function public.admin_update_presentation(uuid, integer, uuid, uuid, text, uuid, text, text) to authenticated;
grant execute on function public.admin_remove_presentation(uuid, integer, text, boolean) to authenticated;

comment on table public.schedule_date_closures is 'Admin-managed closed dates, including holidays with no slots yet. Closing is blocked by any active booking.';
comment on function public.admin_remove_presentation(uuid, integer, text, boolean) is 'Explicit, revision-checked cancellation or soft deletion. Retains all files and history; never reopens a slot or restores a record.';
commit;
