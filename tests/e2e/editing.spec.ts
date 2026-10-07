import AxeBuilder from "@axe-core/playwright";
import { test, expect, localSql, signIn } from "./schedule-fixtures";

function createBooking(slot: string, employee: string) {
  return localSql(
    `insert into public.presentations(slot_id,presenter_user_id,title,description,reference_url) values ('${slot}','${employee}','Original topic','Original abstract','https://example.test/original') returning id;`,
  ).split("\n")[0]!;
}

test("edit all content today, move to a later slot, and explicitly cancel while retaining the record", async ({
  page,
  account,
  slots,
}, info) => {
  const source = slots.create(),
    target = slots.create(100),
    id = createBooking(source.id, account.id);
  await signIn(page, account, "/schedule");
  await page
    .locator(`#presentation-${id}`)
    .getByRole("link", { name: "Edit presentation" })
    .click();
  await expect(page.getByLabel("Presentation title")).toHaveValue(
    "Original topic",
  );
  await expect(page.getByLabel("Short description")).toHaveValue(
    "Original abstract",
  );
  await expect(page.getByLabel("Reference URL")).toHaveValue(
    "https://example.test/original",
  );
  await page.getByLabel("Presentation title").fill("Updated topic");
  await page.getByLabel("Category").selectOption({ label: "AI Research" });
  await page.getByLabel("Short description").fill("🔬".repeat(500));
  await page.getByLabel("Reference URL").fill("https://example.test/updated");
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
    path: info.outputPath("edit-presentation.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Presentation updated.");
  await expect(page.locator(`#presentation-${id}`)).toContainText(
    "Updated topic",
  );
  await page.goto("/");
  await expect(page.locator(`#presentation-${id}`)).toContainText(
    "Updated topic",
  );
  await page
    .locator(`#presentation-${id}`)
    .getByRole("link", { name: "Edit presentation" })
    .click();
  await page.getByLabel("Presentation date and slot").selectOption(target.id);
  await page.getByLabel("Category").selectOption("");
  await page.getByLabel("Short description").fill("");
  await page.getByLabel("Reference URL").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText(`Slot ${target.number}`);
  await expect(
    page.getByRole("heading", { name: "Later presentations", exact: true }),
  ).toBeVisible();
  expect(
    localSql(`select slot_id from public.presentations where id='${id}';`),
  ).toBe(target.id);
  await page.goto("/schedule");
  await expect(
    page
      .locator(`#slot-${source.id}`)
      .getByRole("link", { name: "Volunteer for this slot" }),
  ).toBeVisible();
  await page.goto(`/presentations/${id}/edit`);
  await page
    .getByRole("button", { name: "Cancel presentation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  expect(
    localSql(
      `select cancelled_at is null from public.presentations where id='${id}';`,
    ),
  ).toBe("t");
  await page.getByRole("button", { name: "Keep presentation" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel presentation", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Confirm cancellation", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cancel presentation", exact: true })
    .click();
  await page
    .getByLabel("I confirm that I want to cancel this presentation.")
    .check();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Presentation cancelled.",
  );
  await expect(
    page
      .locator(`#slot-${target.id}`)
      .getByRole("link", { name: "Volunteer for this slot" }),
  ).toBeVisible();
  await expect(page.locator(`#presentation-${id}`)).toHaveCount(0);
  expect(
    localSql(
      `select (cancelled_at is not null) and deleted_at is null from public.presentations where id='${id}';`,
    ),
  ).toBe("t");
  await page.goto(`/presentations/${id}/edit`);
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
});

test("failed rescheduling preserves the draft and original booking; stale edits and cancellation cannot overwrite a later change", async ({
  page,
  account,
  slots,
}) => {
  const source = slots.create(),
    target = slots.create(1),
    id = createBooking(source.id, account.id);
  await signIn(page, account, `/presentations/${id}/edit`);
  await page.getByLabel("Presentation date and slot").selectOption(target.id);
  await page.getByLabel("Presentation title").fill("My unsaved draft");
  await page.getByLabel("Category").selectOption({ label: "AI Research" });
  await page.getByLabel("Short description").fill("x".repeat(501));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Keep the description to 500 characters or fewer.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Presentation date and slot")).toHaveValue(
    target.id,
  );
  await expect(
    page.getByLabel("Category").locator("option:checked"),
  ).toHaveText("AI Research");
  await page.getByLabel("Short description").fill("A preserved description");
  createBooking(target.id, account.id);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Your original booking is unchanged",
  );
  await expect(page.getByLabel("Presentation title")).toHaveValue(
    "My unsaved draft",
  );
  await expect(page.getByLabel("Short description")).toHaveValue(
    "A preserved description",
  );
  await expect(page.getByLabel("Presentation date and slot")).toHaveValue(
    target.id,
  );
  expect(
    localSql(
      `select title,slot_id from public.presentations where id='${id}';`,
    ),
  ).toBe(`Original topic|${source.id}`);
  localSql(
    `update public.presentations set title='Changed in another session' where id='${id}';`,
  );
  await page.getByLabel("Presentation date and slot").selectOption(source.id);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "changed after you opened it",
  );
  await page
    .getByRole("button", { name: "Cancel presentation", exact: true })
    .click();
  await page
    .getByLabel("I confirm that I want to cancel this presentation.")
    .check();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    page.getByRole("form", { name: "Confirm cancellation" }).getByRole("alert"),
  ).toContainText("changed after you opened it");
  expect(
    localSql(
      `select title,cancelled_at is null from public.presentations where id='${id}';`,
    ),
  ).toBe("Changed in another session|t");
  await page
    .getByRole("link", { name: "Reload latest presentation" })
    .first()
    .click();
  await expect(page.getByLabel("Presentation title")).toHaveValue(
    "Changed in another session",
  );
});
