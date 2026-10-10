import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
import { test, expect, signIn, localSql } from "./archive-fixtures";

test("core pages reflow at 320 CSS pixels and with 200 percent text", async ({
  page,
  account,
  archive,
  slots,
}, info) => {
  test.setTimeout(120_000);
  const p = archive.presentation({
    title: `${archive.tag} ${"LongUnbrokenTopic".repeat(8)}`,
    offset: 0,
  });
  const available = slots.create(1);
  const routes = [
    "/",
    "/schedule",
    "/archive",
    "/account/password",
    `/presentations/new?slot=${available.id}`,
    `/presentations/${p.id}`,
    `/presentations/${p.id}/edit`,
    "/schedule/manage",
  ];
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  await signIn(page, account);
  for (const size of [
    { width: 320, font: "100%" },
    { width: 640, font: "200%" },
  ]) {
    await page.setViewportSize({ width: size.width, height: 900 });
    for (const path of routes) {
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.evaluate((font) => {
        document.documentElement.style.fontSize = font;
      }, size.font);
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        content: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll("main *")]
          .filter((el) => el.getBoundingClientRect().right > innerWidth)
          .map((el) => el.className)
          .slice(0, 8),
      }));
      expect
        .soft(
          overflow.content,
          `${path} at ${size.width}px / ${size.font} text: ${overflow.overflowing.join("; ")}`,
        )
        .toBeLessThanOrEqual(overflow.width);
      // Catch controls escaping their cards into a gutter without widening the page.
      const escapedControls = await page
        .locator(
          ".panel button, .panel a, .panel input, .panel select, .panel textarea",
        )
        .evaluateAll(
          (elements) =>
            elements.filter((element) => {
              const rect = element.getBoundingClientRect();
              const panel = element.closest(".panel")!.getBoundingClientRect();
              return (
                rect.width > 0 &&
                (rect.right > panel.right + 1 || rect.left < panel.left - 1)
              );
            }).length,
        );
      expect
        .soft(escapedControls, `${path}: controls stay within panels`)
        .toBe(0);
      if (path.includes("/edit")) {
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`edit-${size.width}.png`),
          fullPage: true,
        });
      }
    }
  }
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  for (const path of ["/login", "/login?mode=recovery"]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("local production page and navigation timings are recorded without runtime errors", async ({
  page,
  account,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, account);
  const measurements = [];
  for (const path of ["/", "/schedule", "/archive"]) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).waitFor();
    measurements.push(
      await page.evaluate((path) => {
        const nav = performance.getEntriesByType(
          "navigation",
        )[0] as PerformanceNavigationTiming;
        return {
          path,
          responseMs: Math.round(nav.responseStart - nav.startTime),
          domContentLoadedMs: Math.round(
            nav.domContentLoadedEventEnd - nav.startTime,
          ),
          transferredBytes: nav.transferSize,
        };
      }, path),
    );
  }
  const start = Date.now();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Schedule", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Presentation schedule" }),
  ).toBeVisible();
  const navigationMs = Date.now() - start;
  expect(errors).toEqual([]);
  const report = info.outputPath("local-performance.json");
  await writeFile(
    report,
    JSON.stringify({ measurements, navigationMs }, null, 2),
  );
  await info.attach("local-performance.json", {
    path: report,
    contentType: "application/json",
  });
});
