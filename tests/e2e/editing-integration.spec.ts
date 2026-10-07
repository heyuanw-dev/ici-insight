import { test, expect, localSql } from "./schedule-fixtures";
import { clientFor, holdSlot, waitForBookings } from "./database-locks";

// Each scenario controls its own waiting RPCs. Browser journeys still run in parallel.
test.describe.configure({ mode: "serial" });

function booking(slot: string, employee: string) {
  return localSql(
    `insert into public.presentations(slot_id,presenter_user_id,title) values ('${slot}','${employee}','Original topic') returning id;`,
  ).split("\n")[0]!;
}

test("two competing reschedules have one winner and preserve the loser's original slot and title", async ({
  account,
  slots,
}) => {
  const sourceA = slots.create(),
    sourceB = slots.create(),
    target = slots.create(1);
  const a = booking(sourceA.id, account.id),
    b = booking(sourceB.id, account.id),
    client = await clientFor(account);
  const release = await holdSlot(target.id);
  try {
    const requests = [a, b].map((id) =>
      Promise.resolve(
        client.rpc("update_presentation", {
          p_id: id,
          p_revision: 1,
          p_slot_id: target.id,
          p_title: "Moved topic",
        }),
      ),
    );
    await waitForBookings(2, "update_presentation");
    // Neither original is released while the destination lock is held.
    expect(
      localSql(
        `select count(*) from public.presentations where slot_id in ('${sourceA.id}','${sourceB.id}');`,
      ),
    ).toBe("2");
    await release();
    const results = await Promise.all(requests);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.find((result) => result.error)?.error?.message).toBe(
      "slot_booked",
    );
    const loser = results[0]?.error ? a : b,
      original = loser === a ? sourceA : sourceB;
    expect(
      localSql(
        `select slot_id,title,revision from public.presentations where id='${loser}';`,
      ),
    ).toBe(`${original.id}|Original topic|1`);
    expect(
      localSql(
        `select count(*) from public.presentations where slot_id='${target.id}';`,
      ),
    ).toBe("1");
  } finally {
    await release();
  }
});

test("rescheduling contends with registration without losing the original booking on failure", async ({
  account,
  slots,
}) => {
  const source = slots.create(),
    target = slots.create(2),
    id = booking(source.id, account.id),
    client = await clientFor(account);
  const release = await holdSlot(target.id);
  try {
    const move = Promise.resolve(
      client.rpc("update_presentation", {
        p_id: id,
        p_revision: 1,
        p_slot_id: target.id,
        p_title: "Moved topic",
      }),
    );
    const register = Promise.resolve(
      client.rpc("register_presentation", {
        p_slot_id: target.id,
        p_title: "Competing booking",
      }),
    );
    await waitForBookings(1, "update_presentation");
    await waitForBookings(1);
    await release();
    const [moved, registered] = await Promise.all([move, register]);
    expect([moved, registered].filter((result) => !result.error)).toHaveLength(
      1,
    );
    expect(
      [moved, registered].find((result) => result.error)?.error?.message,
    ).toBe("slot_booked");
    expect(
      localSql(`select slot_id from public.presentations where id='${id}';`),
    ).toBe(moved.error ? source.id : target.id);
    expect(
      localSql(
        `select count(*) from public.presentations where slot_id='${target.id}' and cancelled_at is null;`,
      ),
    ).toBe("1");
  } finally {
    await release();
  }
});

test("concurrent cancellation and editing reject the stale operation and cannot resurrect a cancelled record", async ({
  account,
  slots,
}) => {
  const source = slots.create(),
    id = booking(source.id, account.id),
    client = await clientFor(account);
  const release = await holdSlot(source.id);
  try {
    const cancel = Promise.resolve(
      client.rpc("cancel_presentation", {
        p_id: id,
        p_revision: 1,
        p_confirm: true,
      }),
    );
    const edit = Promise.resolve(
      client.rpc("update_presentation", {
        p_id: id,
        p_revision: 1,
        p_slot_id: source.id,
        p_title: "Changed topic",
      }),
    );
    await waitForBookings(1, "cancel_presentation");
    await waitForBookings(1, "update_presentation");
    await release();
    const results = await Promise.all([cancel, edit]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.find((result) => result.error)?.error?.message).toBe(
      "presentation_changed",
    );
    expect(
      localSql(`select revision from public.presentations where id='${id}';`),
    ).toBe("2");
    if (results[0]?.error)
      expect(
        (
          await client.rpc("cancel_presentation", {
            p_id: id,
            p_revision: 2,
            p_confirm: true,
          })
        ).error,
      ).toBeNull();
    expect(
      (
        await client.rpc("register_presentation", {
          p_slot_id: source.id,
          p_title: "New booking after cancellation",
        })
      ).error,
    ).toBeNull();
    expect(
      localSql(
        `select count(*) from public.presentations where slot_id='${source.id}';`,
      ),
    ).toBe("2");
  } finally {
    await release();
  }
});

test("a destination closed while rescheduling waits leaves the source and metadata unchanged", async ({
  account,
  slots,
}) => {
  const source = slots.create(),
    target = slots.create(1),
    id = booking(source.id, account.id),
    client = await clientFor(account);
  const release = await holdSlot(target.id, "close");
  try {
    const request = Promise.resolve(
      client.rpc("update_presentation", {
        p_id: id,
        p_revision: 1,
        p_slot_id: target.id,
        p_title: "Uncommitted title",
      }),
    );
    await waitForBookings(1, "update_presentation");
    await release();
    expect((await request).error?.message).toBe("slot_closed");
    expect(
      localSql(
        `select slot_id,title,revision from public.presentations where id='${id}';`,
      ),
    ).toBe(`${source.id}|Original topic|1`);
  } finally {
    await release();
  }
});

test("account deactivation while cancellation waits revokes the pending change", async ({
  account,
  slots,
}) => {
  const source = slots.create(),
    id = booking(source.id, account.id),
    client = await clientFor(account);
  const release = await holdSlot(source.id);
  try {
    const request = Promise.resolve(
      client.rpc("cancel_presentation", {
        p_id: id,
        p_revision: 1,
        p_confirm: true,
      }),
    );
    await waitForBookings(1, "cancel_presentation");
    localSql(
      `update public.users set is_active=false where id='${account.id}';`,
    );
    await release();
    expect((await request).error?.message).toBe("employee_access_required");
    expect(
      localSql(
        `select cancelled_at is null,revision from public.presentations where id='${id}';`,
      ),
    ).toBe("t|1");
  } finally {
    await release();
  }
});

test("the source date is rechecked after a lock wait for both editing and cancellation", async ({
  account,
  slots,
}) => {
  const source = slots.create(),
    target = slots.create(1),
    id = booking(source.id, account.id),
    client = await clientFor(account);
  // Commit an independently changed source date while both RPCs wait, simulating
  // the important condition at midnight: a source that is past by mutation time.
  const release = await holdSlot(source.id, "complete");
  try {
    const edit = Promise.resolve(
      client.rpc("update_presentation", {
        p_id: id,
        p_revision: 1,
        p_slot_id: target.id,
        p_title: "Too late",
      }),
    );
    const cancel = Promise.resolve(
      client.rpc("cancel_presentation", {
        p_id: id,
        p_revision: 1,
        p_confirm: true,
      }),
    );
    await waitForBookings(1, "update_presentation");
    await waitForBookings(1, "cancel_presentation");
    await release();
    for (const result of await Promise.all([edit, cancel]))
      expect(result.error?.message).toBe("presentation_completed");
    expect(
      localSql(
        `select slot_id,title,revision,cancelled_at is null from public.presentations where id='${id}';`,
      ),
    ).toBe(`${source.id}|Original topic|1|t`);
  } finally {
    await release();
  }
});
