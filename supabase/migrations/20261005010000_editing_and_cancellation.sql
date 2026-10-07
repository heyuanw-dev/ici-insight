-- Phase 4: upcoming presentation edits, atomic moves, and retained cancellations.
begin;

alter table public.presentations add column revision integer not null default 1;

create function private.increment_presentation_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
revoke all on function private.increment_presentation_revision() from public, anon, authenticated;
create trigger presentations_increment_revision before update on public.presentations
for each row execute function private.increment_presentation_revision();

-- Shared implementation is not exposed as a client RPC. Public entry points below
-- constrain the operation; all authorization is independently enforced here.
create function private.change_upcoming_presentation(
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
  -- Use wall-clock time AFTER lock waits. Historical admin corrections are Phase 7.
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
    if not target_slot.is_open then
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

create function public.update_presentation(
  p_id uuid, p_revision integer, p_slot_id uuid, p_title text,
  p_category_id uuid default null, p_description text default null, p_reference_url text default null
)
returns uuid language sql volatile security definer set search_path = '' as $$
  select private.change_upcoming_presentation(p_id, p_revision, false, p_slot_id, p_title, p_category_id, p_description, p_reference_url);
$$;

create function public.cancel_presentation(p_id uuid, p_revision integer, p_confirm boolean default false)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_confirm is not true then
    raise exception using errcode = '23514', message = 'cancellation_confirmation_required';
  end if;
  return private.change_upcoming_presentation(p_id, p_revision, true, null, null, null, null, null);
end;
$$;

revoke all on function public.update_presentation(uuid, integer, uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.cancel_presentation(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.update_presentation(uuid, integer, uuid, text, uuid, text, text) to authenticated;
grant execute on function public.cancel_presentation(uuid, integer, boolean) to authenticated;

comment on column public.presentations.revision is 'Incremented on every update; rejects stale edit/cancellation forms.';
comment on function public.update_presentation(uuid, integer, uuid, text, uuid, text, text) is 'Atomically edits/moves an upcoming presentation for its owner or an administrator. Historical workflows remain deferred.';
comment on function public.cancel_presentation(uuid, integer, boolean) is 'Explicitly confirmed upcoming cancellation; retains the presentation and all file records, without reopening closed slots.';
commit;
