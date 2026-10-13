import { spawn } from "node:child_process";
import { once } from "node:events";
import { createClient } from "@supabase/supabase-js";
import { expect, localSql, localSupabase, type Account } from "./fixtures";

export async function clientFor(account: Account) {
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
export async function holdSlot(id: string, change?: "close" | "complete") {
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
    `begin; ${change === "close" ? `update public.presentation_slots set is_open=false where id='${id}';` : change === "complete" ? `update public.presentation_slots set presentation_date='1700-01-01' where id='${id}';` : `select id from public.presentation_slots where id='${id}' for update;`} select 'LOCK_HELD';\n`,
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
export async function waitForBookings(
  count: number,
  operation:
    | "register_presentation"
    | "update_presentation"
    | "cancel_presentation"
    | "admin_set_date_closed"
    | "admin_update_slot"
    | "admin_remove_presentation"
    | "admin_update_presentation"
    | "admin_move_presentation_day" = "register_presentation",
) {
  await expect
    .poll(
      () =>
        Number(
          localSql(
            `select count(*) from pg_stat_activity where pid <> pg_backend_pid() and wait_event_type='Lock' and query ~ '\\m${operation}\\M';`,
          ),
        ),
      { timeout: 10000 },
    )
    .toBeGreaterThanOrEqual(count);
}
