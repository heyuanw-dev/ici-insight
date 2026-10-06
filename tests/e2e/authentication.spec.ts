import {
  test,
  expect,
  signIn,
  createAccount,
  removeAccount,
  localSql,
  adminClient,
  localSupabase,
} from "./fixtures";
import { createClient } from "@supabase/supabase-js";

test.describe("authentication integration", () => {
  test("anonymous, forged-cookie and sign-out access fail closed; sign-in restores a safe destination", async ({
    page,
    context,
    account,
  }) => {
    for (const route of [
      "/",
      "/archive",
      "/schedule",
      "/presentations/new",
      "/presentations/example/edit",
      "/account/password",
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login\?next=/);
      await expect(page.getByRole("navigation")).toHaveCount(0);
    }
    await context.addCookies([
      {
        name: "ici-auth",
        value: "forged",
        url: "http://127.0.0.1:3100",
        httpOnly: true,
      },
    ]);
    await page.goto("/schedule");
    await expect(page).toHaveURL(/\/login/);
    await context.clearCookies();
    await signIn(page, account, "/schedule");
    // Simulate an expired cookie session without forging a signed JWT. The valid
    // refresh token must recover the session before the private page renders.
    const authCookies = (await context.cookies())
      .filter((c) => c.name === "ici-auth" || c.name.startsWith("ici-auth."))
      .sort((a, b) => a.name.localeCompare(b.name));
    const encoded = authCookies.map((c) => c.value).join("");
    const session = JSON.parse(
      Buffer.from(encoded.slice("base64-".length), "base64url").toString(),
    );
    const previousRefreshToken = session.refresh_token;
    session.expires_at = 1;
    const refreshedValue = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
    await context.clearCookies();
    await context.addCookies([
      {
        name: "ici-auth",
        value: refreshedValue,
        url: "http://127.0.0.1:3100",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const response = await page.reload();
    await expect(page).toHaveURL("/schedule");
    const refreshedCookies = (await context.cookies())
      .filter((c) => c.name === "ici-auth" || c.name.startsWith("ici-auth."))
      .sort((a, b) => a.name.localeCompare(b.name));
    const refreshedSession = JSON.parse(
      Buffer.from(
        refreshedCookies
          .map((c) => c.value)
          .join("")
          .slice("base64-".length),
        "base64url",
      ).toString(),
    );
    expect(refreshedSession.refresh_token).not.toBe(previousRefreshToken);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    expect(
      (await context.cookies())
        .filter((c) => c.name.startsWith("ici-auth"))
        .every((c) => c.httpOnly && c.sameSite === "Lax"),
    ).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "ici-auth",
    );
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");
    await page.goto("/archive");
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, account, "/");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/login?next=https://example.test");
    await page.getByLabel("Email address").fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/");
  });

  test("invalid credentials and inactive employees are denied, including existing sessions", async ({
    page,
    account,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(account.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Incorrect-password!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Unable to sign in",
    );
    await signIn(page, account);
    localSql(
      `update public.users set is_active=false where id='${account.id}';`,
    );
    await page.goto("/archive");
    await expect(page).toHaveURL("/login?notice=access");
    await page.getByLabel("Email address").fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "does not have access",
    );
  });

  test("invitation is consumed only by confirmation; password setup is required before workspace access", async ({
    page,
  }) => {
    const account = await createAccount(false);
    try {
      const route = `/auth/confirm?token_hash=${account.token}&type=invite`;
      await page.goto(route);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "You’re invited" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Continue to password setup" })
        .click();
      await expect(page).toHaveURL("/account/password");
      await expect(
        page.getByRole("heading", { name: "Set your password" }),
      ).toBeVisible();
      await page.goto("/schedule");
      await expect(page).toHaveURL("/account/password");
      await page
        .getByLabel("New password", { exact: true })
        .fill(account.password);
      await page
        .getByLabel("Confirm new password")
        .fill("Mismatched-password!");
      await page.getByRole("button", { name: "Save password" }).click();
      await expect(page.getByText("The passwords do not match.")).toBeVisible();
      await page
        .getByLabel("New password", { exact: true })
        .fill(account.password);
      await page.getByLabel("Confirm new password").fill(account.password);
      await page.getByRole("button", { name: "Save password" }).click();
      await expect(page).toHaveURL("/login?notice=password-updated");
      await signIn(page, account);
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.goto(route);
      await page
        .getByRole("button", { name: "Continue to password setup" })
        .click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "invalid or has expired",
      );
    } finally {
      await removeAccount(account);
    }
  });

  test("recovery email uses the confirmation flow and changes the sign-in password", async ({
    page,
    account,
    request,
  }) => {
    await page.goto("/login?mode=recovery");
    await page.getByLabel("Email address").fill(account.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText(
      "If that address has an account",
    );
    const mailpit = localSupabase().MAILPIT_URL;
    let messageId = "";
    await expect
      .poll(async () => {
        const body = await (
          await request.get(`${mailpit}/api/v1/messages`)
        ).json();
        messageId =
          body.messages.find((m: { To: { Address: string }[] }) =>
            m.To.some((to) => to.Address === account.email),
          )?.ID ?? "";
        return !!messageId;
      })
      .toBe(true);
    const message = await (
      await request.get(`${mailpit}/api/v1/message/${messageId}`)
    ).json();
    const match = message.HTML.match(/href="([^"]+)"/);
    expect(match).not.toBeNull();
    const link = new URL(match[1].replaceAll("&amp;", "&"));
    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("type")).toBe("recovery");
    await page.goto(link.pathname + link.search);
    await page
      .getByRole("button", { name: "Continue to password setup" })
      .click();
    await expect(page).toHaveURL("/account/password");
    const newPassword = `New-${account.password}`;
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL("/login?notice=password-updated");
    await signIn(page, { ...account, password: newPassword });
    await request.delete(`${mailpit}/api/v1/messages`, {
      data: { IDs: [messageId] },
    });
  });

  test("role changes take effect immediately; historical and other-presenter edit routes enforce permissions", async ({
    page,
    account,
  }) => {
    const other = await createAccount();
    const slotId = localSql(
      "insert into public.presentation_slots(presentation_date,slot_number) values ((now() at time zone 'America/Vancouver')::date-1,9999) returning id;",
    ).split("\n")[0];
    const id = localSql(
      `insert into public.presentations(slot_id,presenter_user_id,title) values ('${slotId}','${other.id}','Test authorization') returning id;`,
    ).split("\n")[0];
    try {
      await signIn(page, account);
      await page.goto(`/presentations/${id}`);
      await expect(
        page.getByRole("heading", { name: "Presentation details" }),
      ).toBeVisible();
      await page.goto(`/presentations/${id}/edit`);
      await expect(
        page.getByRole("heading", { name: "Let’s get you back on track." }),
      ).toBeVisible();
      localSql(
        `update public.users set role='admin' where id='${account.id}';`,
      );
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Edit presentation", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Administrator", { exact: true }),
      ).toBeVisible();
      localSql(`update public.users set role='user' where id='${account.id}';`);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Let’s get you back on track." }),
      ).toBeVisible();
      await adminClient().auth.admin.updateUserById(account.authId, {
        ban_duration: "1h",
      });
      await page.goto("/schedule");
      await expect(page).toHaveURL(/\/login/);
      await adminClient().auth.admin.updateUserById(account.authId, {
        ban_duration: "none",
      });
      const s = localSupabase();
      const client = createClient(s.API_URL, s.PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
      expect(
        (
          await client
            .from("users")
            .update({ role: "admin" })
            .eq("id", account.id)
        ).error?.code,
      ).toBe("42501");
      expect(
        (await client.from("presentation_slots").select("id")).data?.length,
      ).toBeGreaterThan(0);
      localSql(
        `update public.users set is_active=false where id='${account.id}';`,
      );
      expect(
        (await client.from("presentation_slots").select("id")).data,
      ).toEqual([]);
      const anon = createClient(s.API_URL, s.PUBLISHABLE_KEY, {
        auth: { persistSession: false },
      });
      expect(
        (await anon.from("presentation_slots").select("id")).error,
      ).not.toBeNull();
      expect(
        (
          await anon.auth.signUp({
            email: `signup-${account.email}`,
            password: account.password,
          })
        ).error,
      ).not.toBeNull();
      localSql(`delete from public.users where id='${account.id}';`);
      await page.goto("/archive");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await removeAccount(other);
      localSql(`delete from public.presentation_slots where id='${slotId}';`);
    }
  });
});
