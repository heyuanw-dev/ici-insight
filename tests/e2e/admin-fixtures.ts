import { test as base } from "./files-fixtures";
import { localSql } from "./fixtures";
import { addCalendarDays } from "../../src/lib/schedule/dates";

// Allocate an otherwise empty, distant 12-week window. Never close real holidays
// or change a developer's schedule; the marker excludes overlapping test windows.
export const test = base.extend<{ adminDates: { start: string; end: string } }>(
  {
    adminDates: async ({ account }, provideDates) => {
      void account;
      const start = localSql(`begin;
      select pg_advisory_xact_lock(20261008, 8);
      with candidates as (select date '3000-01-01'+(random()*1000000)::int as d from generate_series(1,100)),
      chosen as (select d from candidates where not exists (select 1 from public.presentation_slots where presentation_date between d-90 and d+90) and not exists (select 1 from public.schedule_date_closures where presentation_date between d-90 and d+90) limit 1)
      insert into public.presentation_slots(presentation_date,slot_number,is_open) select d+83,30000,false from chosen returning presentation_date-83;
      commit;`)
        .split("\n")
        .find((line) => /^\d{4}-\d{2}-\d{2}$/.test(line));
      if (!start)
        throw new Error(
          "Could not allocate an isolated admin test date range.",
        );
      const end = addCalendarDays(start, 83);
      try {
        await provideDates({ start, end });
      } finally {
        localSql(`delete from public.presentation_files where presentation_id in (select p.id from public.presentations p join public.presentation_slots s on s.id=p.slot_id where s.presentation_date between '${start}' and '${end}');
        delete from public.presentations where slot_id in (select id from public.presentation_slots where presentation_date between '${start}' and '${end}');
        delete from public.presentation_slots where presentation_date between '${start}' and '${end}';
        delete from public.schedule_date_closures where presentation_date between '${start}' and '${end}';`);
      }
    },
  },
);
export { expect, signIn, localSql } from "./files-fixtures";
