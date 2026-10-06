import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test as base, expect, type Page } from "@playwright/test";

type LocalStatus = {
  API_URL: string;
  SERVICE_ROLE_KEY: string;
  PUBLISHABLE_KEY: string;
  MAILPIT_URL: string;
};
let status: LocalStatus;
export function localSupabase() {
  if (!status)
    status = JSON.parse(
      execFileSync("npx", ["supabase", "status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  if (status.API_URL !== "http://127.0.0.1:54321")
    throw new Error(
      "Browser tests require this project's local Supabase stack.",
    );
  return status;
}
export function adminClient() {
  const s = localSupabase();
  return createClient(s.API_URL, s.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function localSql(sql: string) {
  localSupabase(); // Refuse remote targets. This container is project-specific.
  return execFileSync(
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
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
export async function createAccount(ready = true, linked = true) {
  const admin = adminClient();
  const email = `e2e-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}!`;
  const invitation = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { name: "Test Employee" } },
  });
  if (invitation.error || !invitation.data.user)
    throw new Error("Could not create local test invitation.");
  const authId = invitation.data.user.id;
  const id = localSql(
    `select id from public.users where auth_user_id='${authId}';`,
  );
  const account = {
    email,
    password,
    authId,
    id,
    token: invitation.data.properties.hashed_token,
  };
  if (ready) {
    const confirmation = await admin.auth.admin.updateUserById(authId, {
      email_confirm: true,
    });
    if (confirmation.error)
      throw new Error("Could not confirm local test account.");
    const { error } = await admin.auth.admin.updateUserById(authId, {
      password,
    });
    if (error) throw new Error("Could not configure local test account.");
  }
  if (!linked) localSql(`delete from public.users where id='${id}';`);
  return account;
}
export type Account = Awaited<ReturnType<typeof createAccount>>;
export async function removeAccount(account: Account) {
  // Only remove records created for this specific test, never reset a developer's database.
  localSql(`delete from public.presentation_files where uploaded_by='${account.id}' or presentation_id in (select id from public.presentations where presenter_user_id='${account.id}');
    delete from public.presentations where presenter_user_id='${account.id}';
    delete from public.users where id='${account.id}';`);
  await adminClient().auth.admin.deleteUser(account.authId);
}
export async function signIn(page: Page, account: Account, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(next);
}
export const test = base.extend<{ account: Account }>({
  account: async ({}, provideAccount) => {
    const account = await createAccount();
    try {
      await provideAccount(account);
    } finally {
      await removeAccount(account);
    }
  },
});
export { expect };
