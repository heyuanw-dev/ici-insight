-- Two default slots per week and an explicit, atomic administrative date move.
begin;

-- Shared by seed and extension. A week with ANY existing slots is deliberate
-- configuration, including a moved day or retained, closed history slots.
create function private.add_weekly_slots(p_start date, p_end date)
returns integer language plpgsql set search_path = '' as $$
declare added integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  insert into public.presentation_slots(presentation_date, slot_number)
  select p_start + n, number
  from generate_series(0, p_end - p_start) n cross join generate_series(1, 2) number
  where extract(isodow from p_start + n) = 2
    and not exists (
      select 1 from public.presentation_slots s
      where s.presentation_date between p_start + n - 1 and p_start + n + 5
    )
  on conflict (presentation_date, slot_number) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;
revoke all on function private.add_weekly_slots(date, date) from public, anon, authenticated;

create or replace function public.admin_extend_schedule(p_start date, p_end date)
returns integer language plpgsql volatile security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  perform private.require_schedule_admin();
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_start < (clock_timestamp() at time zone 'America/Vancouver')::date
    or p_end < p_start or p_end > date '9999-12-31' or p_end - p_start > 366 then
    raise exception using errcode = '23514', message = 'invalid_schedule_range';
  end if;
  return private.add_weekly_slots(p_start, p_end);
end;
$$;

-- Upgrade existing upcoming single-slot weeks without modifying any existing
-- slot or booking. Match the slot's closed state; date closures still apply.
select pg_catalog.pg_advisory_xact_lock(20261008, 7);
insert into public.presentation_slots(presentation_date, slot_number, is_open)
select s.presentation_date, case when s.slot_number = 1 then 2 else 1 end, s.is_open
from public.presentation_slots s
where s.presentation_date >= (clock_timestamp() at time zone 'America/Vancouver')::date
  and not exists (
    select 1 from public.presentation_slots other
    where other.id <> s.id
      and other.presentation_date between
        s.presentation_date - (extract(isodow from s.presentation_date)::integer - 1)
        and s.presentation_date + (7 - extract(isodow from s.presentation_date)::integer)
  )
on conflict (presentation_date, slot_number) do nothing;

create function public.admin_move_presentation_day(
  p_source date, p_target date, p_slots jsonb, p_confirm boolean
)
returns date language plpgsql volatile security definer set search_path = '' as $$
declare
  current_slots jsonb;
  source_slot public.presentation_slots%rowtype;
  target_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(20261008, 7);
  perform private.require_schedule_admin();
  if p_confirm is distinct from true then
    raise exception using errcode = '23514', message = 'confirmation_required';
  end if;
  if p_source is null or p_target is null or not isfinite(p_source) or not isfinite(p_target)
    or p_source < date '0001-01-01' or p_target < date '0001-01-01'
    or p_source > date '9999-12-31' or p_target > date '9999-12-31'
    or p_source = p_target
    or p_source - extract(isodow from p_source)::integer <> p_target - extract(isodow from p_target)::integer then
    raise exception using errcode = '23514', message = 'invalid_week_day';
  end if;
  -- Follow the same slot-before-presentation order as registration and editing.
  perform id from public.presentation_slots where presentation_date in (p_source, p_target) order by id for update;
  perform p.id from public.presentations p join public.presentation_slots s on s.id = p.slot_id
    where s.presentation_date = p_source order by p.id for update of p;
  perform private.require_schedule_admin();
  if least(p_source, p_target) < (clock_timestamp() at time zone 'America/Vancouver')::date then
    raise exception using errcode = 'P0001', message = 'day_move_past';
  end if;
  if exists (select 1 from public.schedule_date_closures where presentation_date in (p_source, p_target)) then
    raise exception using errcode = 'P0001', message = 'day_move_closed';
  end if;
  select jsonb_agg(jsonb_build_object('id', s.id, 'revision', s.revision, 'presentation_id', p.id) order by s.slot_number)
    into current_slots
    from public.presentation_slots s left join public.presentations p on p.slot_id = s.id
      and p.cancelled_at is null and p.deleted_at is null
    where s.presentation_date = p_source;
  -- Includes available slots and active booking identities, so a new booking,
  -- cancellation, added slot, or competing move requires a fresh confirmation.
  if current_slots is null or current_slots is distinct from p_slots then
    raise exception using errcode = 'P0001', message = 'day_move_changed';
  end if;
  if exists (select 1 from public.presentation_slots where presentation_date = p_target) then
    raise exception using errcode = 'P0001', message = 'day_move_conflict';
  end if;

  for source_slot in select * from public.presentation_slots where presentation_date = p_source order by slot_number loop
    insert into public.presentation_slots(presentation_date, slot_number, is_open)
      values (p_target, source_slot.slot_number, source_slot.is_open) returning id into target_id;
    -- Preserve presentation/file identities. The existing trigger increments
    -- presentation revisions so pre-move editors cannot restore the old date.
    update public.presentations set slot_id = target_id where slot_id = source_slot.id
      and cancelled_at is null and deleted_at is null;
    if exists (select 1 from public.presentations where slot_id = source_slot.id) then
      -- Cancelled/deleted history must keep its original date. Its old slot is
      -- retained closed, while all active bookings are on the replacement date.
      update public.presentation_slots set is_open = false where id = source_slot.id;
    else
      delete from public.presentation_slots where id = source_slot.id;
    end if;
  end loop;
  return p_target;
end;
$$;
revoke all on function public.admin_move_presentation_day(date, date, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_move_presentation_day(date, date, jsonb, boolean) to authenticated;

commit;
