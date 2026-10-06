import { test as base, localSql } from "./fixtures";
import { isUuid } from "../../src/lib/auth/redirects";

type TestSlots = {
  create: (
    offset?: number,
    open?: boolean,
  ) => { id: string; date: string; number: number };
};
export const test = base.extend<{ slots: TestSlots }>({
  slots: async ({ account }, provideSlots) => {
    void account; // Ensure slot cleanup runs before this test's employee is removed.
    const ids: string[] = [];
    try {
      await provideSlots({
        create(offset = 0, open = true) {
          if (!Number.isInteger(offset))
            throw new Error("Fixture offset must be an integer.");
          const output = localSql(`begin;
          select pg_advisory_xact_lock(20261005);
          insert into public.presentation_slots(presentation_date,slot_number,is_open)
          select (clock_timestamp() at time zone 'America/Vancouver')::date + ${offset}, greatest(coalesce(max(slot_number),0)+1,1000), ${open}
          from public.presentation_slots where presentation_date=(clock_timestamp() at time zone 'America/Vancouver')::date+${offset}
          returning id;
          commit;`);
          const id = output.split("\n").find(isUuid);
          if (!id) throw new Error("Could not create test slot.");
          ids.push(id);
          const [date, number] = localSql(
            `select presentation_date,slot_number from public.presentation_slots where id='${id}';`,
          ).split("|");
          if (!date || !number)
            throw new Error("Test slot details are missing.");
          return { id, date, number: Number(number) };
        },
      });
    } finally {
      if (ids.length) {
        const list = ids.map((id) => `'${id}'`).join(",");
        localSql(`delete from public.presentation_files where presentation_id in (select id from public.presentations where slot_id in (${list}));
          delete from public.presentations where slot_id in (${list});
          delete from public.presentation_slots where id in (${list});`);
      }
    }
  },
});
export {
  expect,
  localSql,
  signIn,
  createAccount,
  removeAccount,
  localSupabase,
} from "./fixtures";
