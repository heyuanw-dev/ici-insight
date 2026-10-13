import { test, expect, localSql } from "./admin-fixtures";
import { clientFor, holdSlot, waitForBookings } from "./database-locks";
import { createAccount, removeAccount } from "./fixtures";
import { addCalendarDays, calendarWeek } from "../../src/lib/schedule/dates";

test("a day move and registration serialize in either order without moving an unconfirmed booking", async ({
  account,
  adminDates,
}) => {
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  const other = await createAccount();
  try {
    const admin = await clientFor(account),
      user = await clientFor(other);
    for (const moveFirst of [true, false]) {
      const monday = addCalendarDays(
        calendarWeek(adminDates.start).start,
        moveFirst ? 7 : 14,
      );
      const source = addCalendarDays(monday, 1),
        target = addCalendarDays(monday, 2);
      const { data: id, error } = await admin.rpc("admin_create_slot", {
        p_date: source,
      });
      expect(error).toBeNull();
      const release = await holdSlot(id);
      const move = () =>
        Promise.resolve(
          admin.rpc("admin_move_presentation_day", {
            p_source: source,
            p_target: target,
            p_slots: [{ id, revision: 1, presentation_id: null }],
            p_confirm: true,
          }),
        );
      const book = () =>
        Promise.resolve(
          user.rpc("register_presentation", {
            p_slot_id: id,
            p_title: "Concurrent day booking",
          }),
        );
      try {
        const first = moveFirst ? move() : book();
        await waitForBookings(
          1,
          moveFirst ? "admin_move_presentation_day" : "register_presentation",
        );
        const second = moveFirst ? book() : move();
        await waitForBookings(
          1,
          moveFirst ? "register_presentation" : "admin_move_presentation_day",
        );
        await release();
        const results = await Promise.all([first, second]);
        expect(results[0].error).toBeNull();
        expect(results[1].error?.message).toBe(
          moveFirst ? "slot_not_found" : "day_move_changed",
        );
        expect(
          localSql(
            `select count(*) from public.presentation_slots where presentation_date='${target}'`,
          ),
        ).toBe(moveFirst ? "1" : "0");
        expect(
          localSql(
            `select count(*) from public.presentations where slot_id='${id}' and cancelled_at is null and deleted_at is null`,
          ),
        ).toBe(moveFirst ? "0" : "1");
      } finally {
        await release();
      }
    }
  } finally {
    await removeAccount(other);
  }
});

test("day moves recheck administrator access after a row-lock wait", async ({
  account,
  adminDates,
}) => {
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  const admin = await clientFor(account);
  const monday = addCalendarDays(calendarWeek(adminDates.start).start, 7),
    source = addCalendarDays(monday, 1),
    target = addCalendarDays(monday, 2);
  const { data: id, error } = await admin.rpc("admin_create_slot", {
    p_date: source,
  });
  expect(error).toBeNull();
  const release = await holdSlot(id);
  try {
    const request = Promise.resolve(
      admin.rpc("admin_move_presentation_day", {
        p_source: source,
        p_target: target,
        p_slots: [{ id, revision: 1, presentation_id: null }],
        p_confirm: true,
      }),
    );
    await waitForBookings(1, "admin_move_presentation_day");
    localSql(`update public.users set role='user' where id='${account.id}'`);
    await release();
    expect((await request).error?.message).toBe("admin_access_required");
    expect(
      localSql(
        `select presentation_date,revision from public.presentation_slots where id='${id}'`,
      ),
    ).toBe(`${source}|1`);
    expect(
      localSql(
        `select count(*) from public.presentation_slots where presentation_date='${target}'`,
      ),
    ).toBe("0");
  } finally {
    await release();
  }
});
