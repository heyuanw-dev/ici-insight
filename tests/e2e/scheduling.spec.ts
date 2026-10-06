import AxeBuilder from "@axe-core/playwright";
import { test, expect, localSql, signIn } from "./schedule-fixtures";

test("12-week schedule groups same-day slots, marks closures, excludes the past, and reaches later dates", async ({
  page,
  account,
  slots,
}) => {
  const today = slots.create(),
    second = slots.create(),
    closed = slots.create(1, false),
    past = slots.create(-1),
    edge = slots.create(83),
    later = slots.create(84),
    last = slots.create(190);
  await signIn(page, account, "/schedule");
  await expect(
    page.getByRole("heading", { name: "Next 12 weeks", exact: true }),
  ).toBeVisible();
  await expect(page.locator(`#slot-${today.id}`)).toBeVisible();
  await expect(page.locator(`#slot-${second.id}`)).toBeVisible();
  await expect(page.locator(`#slot-${closed.id}`)).toContainText(
    "Closed · Unavailable",
  );
  await expect(
    page.locator(`#slot-${closed.id}`).getByRole("link"),
  ).toHaveCount(0);
  await expect(page.locator(`#slot-${past.id}`)).toHaveCount(0);
  await expect(page.locator(`#slot-${edge.id}`)).toBeVisible();
  await expect(page.locator(`#slot-${later.id}`)).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Schedule dates" })
    .getByRole("link", { name: "Next 12 weeks" })
    .click();
  await expect(page.locator(`#slot-${later.id}`)).toBeVisible();
  await page
    .getByRole("navigation", { name: "Schedule dates" })
    .getByRole("link", { name: "Next 12 weeks" })
    .click();
  await expect(page.locator(`#slot-${last.id}`)).toBeVisible();
  await page.getByRole("link", { name: "Previous 12 weeks" }).click();
  await expect(page.locator(`#slot-${later.id}`)).toBeVisible();
  for (const unavailable of [closed, past]) {
    await page.goto(`/presentations/new?slot=${unavailable.id}`);
    await expect(
      page.getByRole("heading", { name: "Slot unavailable" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm registration" }),
    ).toHaveCount(0);
  }
});

test("employee can register today, see confirmation and Home, and book a separate same-day slot without slides", async ({
  page,
  account,
  slots,
}, info) => {
  const first = slots.create(),
    second = slots.create();
  const title = `A useful AI insight ${first.id.slice(0, 8)}`;
  await signIn(page, account, "/schedule");
  await page
    .locator(`#slot-${first.id}`)
    .getByRole("link", { name: "Volunteer for this slot" })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected presentation slot" }),
  ).toContainText("Test Employee");
  await expect(
    page.getByRole("region", { name: "Selected presentation slot" }),
  ).toContainText(`Slot ${first.number}`);
  await page.getByLabel("Presentation title").fill(title);
  await page.getByLabel("Category").selectOption({ label: "AI Research" });
  await page
    .getByLabel("Short description")
    .fill("A practical look at a recent research paper.");
  await page.getByLabel("Reference URL").fill("https://example.test/research");
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
  await page.screenshot({
    path: info.outputPath("registration.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your presentation is scheduled.",
  );
  const id = localSql(
    `select id from public.presentations where slot_id='${first.id}' and presenter_user_id='${account.id}';`,
  );
  await expect(page.locator(`#presentation-${id}`)).toContainText(title);
  await expect(page.locator(`#presentation-${id}`)).toContainText(
    "AI Research",
  );
  await expect(
    page
      .locator(`#presentation-${id}`)
      .getByRole("link", { name: /View reference/ }),
  ).toHaveAttribute("href", "https://example.test/research");
  await page.goto("/");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.locator(`#slot-${second.id}`)).toBeVisible();
  await page
    .locator(`#slot-${second.id}`)
    .getByRole("link", { name: "Volunteer to present" })
    .click();
  await page.getByLabel("Presentation title").fill("A title is enough");
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your presentation is scheduled.",
  );
  expect(
    localSql(
      `select count(*) from public.presentations where slot_id in ('${first.id}','${second.id}');`,
    ),
  ).toBe("2");
  expect(
    localSql(
      `select count(*) from public.presentation_files where uploaded_by='${account.id}';`,
    ),
  ).toBe("0");
  await page.goto(`/presentations/new?slot=${first.id}`);
  await expect(
    page.getByRole("heading", { name: "Slot unavailable" }),
  ).toBeVisible();
});

test("server validation preserves the draft; a stale booking form reports a conflict instead of replacing a presentation", async ({
  page,
  account,
  slots,
}) => {
  const slot = slots.create(2),
    later = slots.create(100);
  await signIn(page, account, `/presentations/new?slot=${slot.id}`);
  await page.getByLabel("Presentation title").fill("  ");
  await page.getByLabel("Short description").fill("a".repeat(501));
  await page.getByLabel("Reference URL").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(
    page.getByText("Enter a presentation title.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Keep the description to 500 characters or fewer.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Short description")).toHaveValue(
    "a".repeat(501),
  );
  await page.getByLabel("Presentation title").fill("My preserved draft");
  await page.getByLabel("Short description").fill("a".repeat(500));
  await page.getByLabel("Reference URL").fill("https://example.test");
  localSql(
    `insert into public.presentations(slot_id,presenter_user_id,title) values ('${slot.id}','${account.id}','Already reserved');`,
  );
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "This slot has just been booked",
  );
  await expect(page.getByLabel("Presentation title")).toHaveValue(
    "My preserved draft",
  );
  await expect(page.getByLabel("Short description")).toHaveValue(
    "a".repeat(500),
  );
  expect(
    localSql(
      `select title from public.presentations where slot_id='${slot.id}';`,
    ),
  ).toBe("Already reserved");
  await page.goto(`/presentations/new?slot=${later.id}`);
  const laterTitle = `A later presentation ${later.id.slice(0, 8)}`;
  await page.getByLabel("Presentation title").fill(laterTitle);
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your presentation is scheduled.",
  );
  await expect(
    page.getByRole("heading", { name: laterTitle, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Later presentations", exact: true }),
  ).toBeVisible();
});
