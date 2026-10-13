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

-- Two Tuesday slots for each unconfigured week. Never recreate the original
-- Tuesday after an admin moves that week's presentation day.
select private.add_weekly_slots(
  (now() at time zone 'America/Vancouver')::date,
  ((now() at time zone 'America/Vancouver')::date + interval '6 months' - interval '1 day')::date
);

commit;
