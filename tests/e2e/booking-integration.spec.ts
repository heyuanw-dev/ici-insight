import {
  test,
  expect,
  localSql,
  createAccount,
  removeAccount,
} from "./schedule-fixtures";
import { clientFor, holdSlot, waitForBookings } from "./database-locks";

test("two simultaneous bookings produce exactly one winner; another same-day slot remains bookable", async ({
  account,
  slots,
}) => {
  const target = slots.create(),
    second = slots.create(),
    other = await createAccount();
  const release = await holdSlot(target.id);
  try {
    const a = await clientFor(account),
      b = await clientFor(other);
    const requests = [
      a.rpc("register_presentation", {
        p_slot_id: target.id,
        p_title: "First contender",
      }),
      b.rpc("register_presentation", {
        p_slot_id: target.id,
        p_title: "Second contender",
      }),
    ].map((request) => Promise.resolve(request));
    await waitForBookings(2);
    await release();
    const results = await Promise.all(requests);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.find((result) => result.error)?.error?.message).toBe(
      "slot_booked",
    );
    expect(
      localSql(
        `select count(*) from public.presentations where slot_id='${target.id}';`,
      ),
    ).toBe("1");
    const next = await b.rpc("register_presentation", {
      p_slot_id: second.id,
      p_title: "A separate same-day slot",
    });
    expect(next.error).toBeNull();
    expect(
      localSql(
        `select presenter_user_id from public.presentations where id='${next.data}';`,
      ),
    ).toBe(other.id);
    expect(
      (
        await a.rpc("register_presentation", {
          p_slot_id: second.id,
          p_title: "Spoof",
          p_presenter_user_id: other.id,
        })
      ).error,
    ).not.toBeNull();
  } finally {
    await release();
    await removeAccount(other);
  }
});

test("a concurrent closure is respected after the lock wait and never creates a booking", async ({
  account,
  slots,
}) => {
  const target = slots.create(1),
    client = await clientFor(account);
  const release = await holdSlot(target.id, "close");
  try {
    const request = Promise.resolve(
      client.rpc("register_presentation", {
        p_slot_id: target.id,
        p_title: "Too late for this slot",
      }),
    );
    await waitForBookings(1);
    await release();
    expect((await request).error?.message).toBe("slot_closed");
    expect(
      localSql(
        `select count(*) from public.presentations where slot_id='${target.id}';`,
      ),
    ).toBe("0");
  } finally {
    await release();
  }
});

test("employee deactivation during a lock wait revokes the pending booking", async ({
  account,
  slots,
}) => {
  const target = slots.create(2),
    client = await clientFor(account);
  const release = await holdSlot(target.id);
  try {
    const request = Promise.resolve(
      client.rpc("register_presentation", {
        p_slot_id: target.id,
        p_title: "Pending registration",
      }),
    );
    await waitForBookings(1);
    localSql(
      `update public.users set is_active=false where id='${account.id}';`,
    );
    await release();
    expect((await request).error?.message).toBe("employee_access_required");
    expect(
      localSql(
        `select count(*) from public.presentations where slot_id='${target.id}';`,
      ),
    ).toBe("0");
  } finally {
    await release();
  }
});
