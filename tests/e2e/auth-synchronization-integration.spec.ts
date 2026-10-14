import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  adminClient,
  localSql,
  removeAccount,
  signIn,
} from "./fixtures";
import type { Database } from "../../src/types/database";

test("Dashboard-style user creation automatically provisions a shared UUID and preserves existing administrator profiles on Auth updates", async ({
  page,
  context,
}) => {
  const admin = adminClient();
  const email = `e2e-manual-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}!`;
  // Supabase Dashboard's Create user uses the Auth admin API, not invitations.
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "Manual Employee",
      role: "admin",
      is_active: false,
    },
  });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  const account = { id, authId: id, email, password, token: "" };
  const getProfile = async () => {
    // Inspect through the local administrator connection, as other fixtures do.
    // Application service-role grants intentionally do not include this table.
    return JSON.parse(
      localSql(`select row_to_json(u) from (
      select id,auth_user_id,name,email,role,is_active,password_setup_required
      from public.users where auth_user_id='${id}'
    ) u;`),
    ) as Pick<
      Database["public"]["Tables"]["users"]["Row"],
      | "id"
      | "auth_user_id"
      | "name"
      | "email"
      | "role"
      | "is_active"
      | "password_setup_required"
    >;
  };
  try {
    expect(await getProfile()).toEqual({
      id,
      auth_user_id: id,
      name: "Manual Employee",
      email,
      role: "user",
      is_active: true,
      password_setup_required: true,
    });
    await page.goto("/login?next=/schedule");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/account/password");
    const chosenPassword = `Chosen-${password}`;
    await page.getByLabel("New password", { exact: true }).fill(chosenPassword);
    await page.getByLabel("Confirm new password").fill(chosenPassword);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL("/login?notice=password-updated");
    account.password = chosenPassword;
    await signIn(page, account, "/schedule");
    localSql(
      `update public.users set role='admin',name='Existing administrator' where id='${id}';`,
    );
    const updatedEmail = `updated-${email}`;
    for (let i = 0; i < 2; i++) {
      const updated = await admin.auth.admin.updateUserById(id, {
        email: updatedEmail,
        user_metadata: { name: "Replaced", role: "user", is_active: false },
      });
      expect(updated.error).toBeNull();
    }
    expect(await getProfile()).toEqual({
      id,
      auth_user_id: id,
      name: "Existing administrator",
      email: updatedEmail,
      role: "admin",
      is_active: true,
      password_setup_required: false,
    });
    await context.clearCookies();
    await signIn(page, { ...account, email: updatedEmail }, "/schedule");
    await expect(
      page.getByRole("link", { name: "Manage schedule" }),
    ).toBeVisible();
    localSql(`update public.users set is_active=false where id='${id}';`);
    const updated = await admin.auth.admin.updateUserById(id, {
      email: updatedEmail,
      user_metadata: { is_active: true },
    });
    expect(updated.error).toBeNull();
    expect((await getProfile())?.is_active).toBe(false);
    await page.reload();
    await expect(page).toHaveURL("/login?notice=access");
  } finally {
    await removeAccount(account);
  }
});

test("manually provisioned accounts without a password can complete website password setup", async ({
  page,
}) => {
  const admin = adminClient();
  const email = `e2e-setup-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  const account = { id, authId: id, email, password, token: "" };
  try {
    expect(
      localSql(
        `select id=auth_user_id and password_setup_required from public.users where id='${id}';`,
      ),
    ).toBe("t");
    const recovery = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    expect(recovery.error).toBeNull();
    await page.goto(
      `/auth/confirm?type=recovery&token_hash=${recovery.data.properties!.hashed_token}`,
    );
    await page
      .getByRole("button", { name: "Continue to password setup" })
      .click();
    await expect(page).toHaveURL("/account/password");
    await page.goto("/schedule");
    await expect(page).toHaveURL("/account/password");
    await page.getByLabel("New password", { exact: true }).fill(password);
    await page.getByLabel("Confirm new password").fill(password);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL("/login?notice=password-updated");
    await signIn(page, account, "/schedule");
    expect(
      localSql(
        `select id=auth_user_id and not password_setup_required from public.users where id='${id}';`,
      ),
    ).toBe("t");
  } finally {
    await removeAccount(account);
  }
});
