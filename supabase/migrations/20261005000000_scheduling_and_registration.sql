-- Phase 3: a readable schedule and one transactional, self-service booking operation.
begin;

create view public.schedule_slots with (security_invoker = true) as
select s.id as slot_id, s.presentation_date, s.slot_number, s.is_open,
  p.id as presentation_id, p.presenter_user_id, u.name as presenter_name,
  p.title, p.description, p.category_id, c.name as category_name, p.reference_url
from public.presentation_slots s
left join public.presentations p on p.slot_id = s.id
  and p.cancelled_at is null and p.deleted_at is null
left join public.users u on u.id = p.presenter_user_id
left join public.categories c on c.id = p.category_id;

revoke all on public.schedule_slots from public, anon, authenticated;
grant select on public.schedule_slots to authenticated;

create function public.register_presentation(
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
  if not chosen_slot.is_open then
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

revoke all on function public.register_presentation(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_presentation(uuid, text, uuid, text, text) to authenticated;

comment on view public.schedule_slots is
  'RLS-preserving slots with their current booking, including closed slots. Cancelled/deleted presentations release availability; date and open-state still apply.';
comment on function public.register_presentation(uuid, text, uuid, text, text) is
  'Books an open current/future Vancouver slot for the authenticated active employee. Serializes competing bookings; accepts no presenter, date, status, or file overrides.';

-- No direct writes or editing/cancellation/storage/admin operations are granted.
commit;
