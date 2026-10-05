import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", heading: "AI insight,shared together.", nav: "Home" },
  { path: "/schedule", heading: "Presentation schedule", nav: "Schedule" },
  { path: "/archive", heading: "Presentation archive", nav: "Archive" },
] as const;

for (const { path, heading, nav } of pages) {
  test(`${nav} renders accessibly without overflow or runtime errors`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: nav, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByText("Workspace preview", { exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("page.png"),
      fullPage: true,
    });
  });
}

test("primary navigation, home actions, and browser history work", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "View upcoming presentations" }).click();
  await expect(page).toHaveURL("/schedule");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Archive", exact: true })
    .click();
  await expect(page).toHaveURL("/archive");
  await page.goBack();
  await expect(page).toHaveURL("/schedule");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await page.getByRole("link", { name: "Browse presentation archive" }).click();
  await expect(page).toHaveURL("/archive");
});

test("keyboard users can skip navigation and sign-in collects no credentials", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign-in is coming soon" }),
  ).toBeVisible();
  await expect(page.locator("form, input")).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("supporting routes are honest placeholders and unknown routes return 404", async ({
  page,
}) => {
  for (const path of [
    "/presentations/new",
    "/presentations/example",
    "/presentations/example/edit",
    "/account/password",
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "This space is getting ready" }),
    ).toBeVisible();
    await expect(page.locator("form, input")).toHaveCount(0);
  }
  const missing = await page.goto("/this-page-does-not-exist");
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Let’s get you back on track." }),
  ).toBeVisible();
});
