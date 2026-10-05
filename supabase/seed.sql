-- Reference data only: no employees, credentials, or sample presentations.
-- Re-running preserves category edits, existing bookings, and closed slots.
begin;

insert into public.categories (name, sort_order) values
  ('AI Research', 1),
  ('Large Language Models', 2),
  ('Agents', 3),
  ('Computer Vision', 4),
  ('Multimodal AI', 5),
  ('Robotics', 6),
  ('AI Infrastructure', 7),
  ('AI Tools', 8),
  ('AI Safety', 9),
  ('Industry News', 10),
  ('Product / Demo', 11),
  ('Other', 12)
on conflict (lower(btrim(name))) do nothing;

with horizon as (
  select (now() at time zone 'America/Vancouver')::date as starts_on
), dates as (
  select day::date as presentation_date
  from horizon,
  lateral generate_series(
    starts_on::timestamp,
    starts_on::timestamp + interval '6 months' - interval '1 day',
    interval '1 day'
  ) as day
)
insert into public.presentation_slots (presentation_date, slot_number)
select presentation_date, 1 from dates
where extract(isodow from presentation_date) = 2
on conflict (presentation_date, slot_number) do nothing;

commit;
