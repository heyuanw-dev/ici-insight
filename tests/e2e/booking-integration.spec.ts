import { spawn } from "node:child_process";
import { once } from "node:events";
import { createClient } from "@supabase/supabase-js";
import {
  test,
  expect,
  localSql,
  localSupabase,
  createAccount,
  removeAccount,
} from "./schedule-fixtures";
import type { Account } from "./fixtures";

async function clientFor(account: Account) {
  const status = localSupabase();
  const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error)
    throw new Error("Could not sign in a local integration-test employee.");
  return client;
}

// A separate PostgreSQL connection deliberately holds the slot lock so tests
// verify real contention, rather than hoping two requests happen to overlap.
async function holdSlot(id: string, close = false) {
  const process = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_ici-insight-hub",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const exited = once(process, "exit");
  const ready = new Promise<void>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(
      () => reject(new Error("Test slot lock timed out.")),
      10000,
    );
    process.stdout.on("data", (data: Buffer) => {
      output += data.toString();
      if (output.includes("LOCK_HELD")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    process.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    process.once("exit", () => {
      clearTimeout(timeout);
      if (!output.includes("LOCK_HELD"))
        reject(new Error("Test lock connection closed unexpectedly."));
    });
  });
  process.stdin.write(
    `begin; ${close ? `update public.presentation_slots set is_open=false where id='${id}';` : `select id from public.presentation_slots where id='${id}' for update;`} select 'LOCK_HELD';\n`,
  );
  try {
    await ready;
  } catch (error) {
    process.stdin.end("rollback;\n");
    throw error;
  }
  let released = false;
  return async () => {
    if (!released) {
      released = true;
      process.stdin.end("commit;\n");
      await exited;
    }
  };
}
async function waitForBookings(count: number) {
  await expect
    .poll(
      () =>
        Number(
          localSql(
            "select count(*) from pg_stat_activity where pid <> pg_backend_pid() and wait_event_type='Lock' and query ilike '%register_presentation%';",
          ),
        ),
      { timeout: 10000 },
    )
    .toBeGreaterThanOrEqual(count);
}

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
  const release = await holdSlot(target.id, true);
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
