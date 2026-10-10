import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, localSql } from "./files-fixtures";
import { pdfBytes } from "../fixtures/slides";

test("validation focuses the invalid field, preserves drafts, and pending registration prevents duplicates", async ({
  page,
  account,
  slots,
}) => {
  const slot = slots.create();
  await signIn(page, account, `/presentations/new?slot=${slot.id}`);
  const title = page.getByLabel("Presentation title");
  const description = page.getByLabel("Short description");
  const submit = page.getByRole("button", { name: "Confirm registration" });
  await title.fill("Keyboard registration");
  await description.fill("a".repeat(501));
  for (let attempt = 0; attempt < 2; attempt++) {
    await submit.focus();
    await page.keyboard.press("Enter");
    await expect(description).toBeFocused();
    await expect(description).toHaveAttribute(
      "aria-describedby",
      /description-error/,
    );
    await expect(title).toHaveValue("Keyboard registration");
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await description.fill("A valid draft");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  await page.route("**/presentations/new?*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    await gate;
    await route.continue();
  });
  try {
    await submit.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Booking your slot…" }),
    ).toBeDisabled();
    await expect(title).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(posts).toBeLessThanOrEqual(1);
  } finally {
    release();
  }
  await expect(page.getByRole("status")).toContainText(
    "Your presentation is scheduled.",
  );
  expect(posts).toBe(1);
  expect(
    localSql(
      `select count(*) from public.presentations where slot_id='${slot.id}'`,
    ),
  ).toBe("1");
});

test("file errors are associated, focused, understandable, and retry preserves the selected file", async ({
  page,
  account,
  archive,
}) => {
  const p = archive.presentation({ title: `${archive.tag} File feedback` });
  await signIn(page, account, `/presentations/${p.id}`);
  const choose = page.getByLabel("Choose .pdf file");
  await choose.setInputFiles({
    name: "Retry.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes(),
  });
  const pattern = `**/api/presentations/${p.id}/files/uploads`;
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "<h1>Unavailable</h1>",
    }),
  );
  const submit = page.getByRole("button", {
    name: "Upload PDF preview",
    exact: true,
  });
  await submit.click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText(
    "Unexpected file response. Please reload and retry.",
  );
  await expect(alert).toBeFocused();
  await expect(choose).toHaveAttribute("aria-invalid", "true");
  await expect(choose).toHaveAttribute("aria-describedby", /upload-pdf-error/);
  await page.unroute(pattern);
  await page.route(pattern, (route) => route.abort("connectionfailed"));
  await submit.click();
  await expect(alert).toContainText("connection was interrupted");
  await expect(alert).toBeFocused();
  await page.unroute(pattern);
  await submit.click();
  await expect(
    page.getByText("PDF preview saved successfully.", { exact: true }),
  ).toBeVisible();
  await expect(choose).toHaveAttribute("aria-invalid", "false");
});

test("administrative confirmations can be dismissed with Keep or Escape and restore focus", async ({
  page,
  account,
  archive,
}) => {
  const p = archive.presentation({
    title: `${archive.tag} Dismiss confirmation`,
  });
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  await signIn(page, account, `/presentations/${p.id}/edit`);
  for (const operation of ["Cancel", "Delete"]) {
    const toggle = page.getByRole("button", {
      name: `${operation} presentation`,
      exact: true,
    });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Keep presentation" }).click();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByRole("checkbox").focus();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  }
  expect(
    localSql(
      `select cancelled_at is null and deleted_at is null from public.presentations where id='${p.id}'`,
    ),
  ).toBe("t");
});

test("sign-in errors receive focus and an invited employee can retry", async ({
  page,
  account,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Incorrect-password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toBeFocused();
  await expect(alert).toContainText("email and password");
  await expect(page.getByLabel("Email address")).toHaveValue(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
});
