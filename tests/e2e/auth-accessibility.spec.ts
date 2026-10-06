import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

test("login and recovery forms are accessible across screen sizes", async ({
  page,
}) => {
  for (const route of [
    "/login",
    "/login?mode=recovery",
    "/auth/confirm?type=invite&token_hash=aaaaaaaaaaaaaaaaaaaa",
  ]) {
    await page.goto(route);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
