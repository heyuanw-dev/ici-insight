import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, localSql } from "./admin-fixtures";
import {
  addCalendarDays,
  formatPresentationDate,
} from "../../src/lib/schedule/dates";

test("admins add same-day slots, preserve holiday closures during extension, and reopen dates deliberately", async ({
  page,
  account,
  adminDates,
}, info) => {
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  await signIn(page, account, "/schedule");
  await page
    .getByRole("link", { name: "Manage schedule", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Manage schedule", exact: true }),
  ).toBeVisible();
  await page.goto(`/schedule/manage?start=${adminDates.start}`);
  const add = page.getByRole("form", { name: "Add a presentation slot" });
  await add.getByRole("button", { name: "Add slot", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Slot added.");
  await add.getByRole("button", { name: "Add slot", exact: true }).click();
  await expect(
    page.getByRole("region", {
      name: `Slot 2 on ${adminDates.start}`,
      exact: true,
    }),
  ).toBeVisible();
  const first = page.getByRole("region", {
    name: `Slot 1 on ${adminDates.start}`,
    exact: true,
  });
  await first.getByLabel("Open for bookings").uncheck();
  await first.getByRole("button", { name: "Save slot" }).click();
  await expect(page.getByRole("status")).toContainText("Slot updated.");
  const date = new Date(`${adminDates.start}T00:00:00Z`);
  const holiday = addCalendarDays(
    adminDates.start,
    ((9 - date.getUTCDay()) % 7) + 7,
  );
  const close = page.getByRole("form", { name: "Close a presentation date" });
  await close.getByLabel("Date to close").fill(holiday);
  await close.getByRole("checkbox").check();
  await close.getByRole("button", { name: "Close date", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Date closed");
  const extend = page.getByRole("form", { name: "Extend weekly schedule" });
  for (let run = 0; run < 2; run++) {
    await extend.getByLabel("Start date").fill(adminDates.start);
    await extend
      .getByLabel("End date")
      .fill(addCalendarDays(adminDates.start, 28));
    await extend
      .getByRole("button", { name: "Extend schedule", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Weekly schedule extended.",
    );
  }
  await expect(page.getByRole("status")).toContainText("0 slots added.");
  const holidaySlot = page.getByRole("region", {
    name: `Slot 1 on ${holiday}`,
    exact: true,
  });
  await expect(holidaySlot.getByText("Closed", { exact: true })).toBeVisible();
  await expect(first.getByLabel("Open for bookings")).not.toBeChecked();
  await expect(
    page.getByRole("region", {
      name: `Slot 2 on ${adminDates.start}`,
      exact: true,
    }),
  ).toBeVisible();
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
    path: info.outputPath("admin-schedule.png"),
    fullPage: true,
  });
  const reopen = page.getByRole("form", {
    name: `Reopen ${formatPresentationDate(holiday)}`,
    exact: true,
  });
  await reopen.getByRole("checkbox").check();
  await reopen
    .getByRole("button", { name: "Reopen date", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Date reopened.");
  await expect(
    holidaySlot.getByText("Available", { exact: true }),
  ).toBeVisible();
});

test("admin corrects historical metadata and presenter, cancels a completed record, and deletes it with confirmation", async ({
  page,
  account,
  archive,
  slots,
}, info) => {
  const title = `${archive.tag} Historical administration`;
  const p = archive.presentation({ title, offset: -4 });
  const target = slots.create(-5);
  const former = archive.formerPresenter(`${archive.tag} Former presenter`);
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  await signIn(page, account, `/presentations/${p.id}`);
  await page
    .getByRole("link", { name: "Edit presentation", exact: true })
    .click();
  await page.getByLabel("Presenter", { exact: true }).selectOption(former);
  await page.getByLabel("Presentation date and slot").selectOption(target.id);
  await page.getByLabel("Presentation title").fill(`${title} corrected`);
  await page
    .getByLabel("Short description")
    .fill("Corrected historical abstract");
  await page.getByLabel("Reference URL").fill("https://example.test/corrected");
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
    path: info.outputPath("admin-presentation.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Presentation updated.");
  await expect(
    page.getByRole("heading", { name: `${title} corrected`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`${archive.tag} Former presenter`, { exact: true }),
  ).toBeVisible();
  await page.goto(`/archive?q=${encodeURIComponent(title)}`);
  await expect(
    page.getByRole("link", { name: `${title} corrected`, exact: true }),
  ).toBeVisible();
  await page.goto(`/presentations/${p.id}/edit`);
  await page
    .getByRole("button", { name: "Cancel presentation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  expect(
    localSql(
      `select cancelled_at is null from public.presentations where id='${p.id}'`,
    ),
  ).toBe("t");
  await page
    .getByLabel("I confirm that I want to cancel this presentation.")
    .check();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Presentation cancelled.",
  );
  await page.goto(`/schedule/manage?start=${target.date}`);
  const cancelled = page.getByRole("region", {
    name: "Cancelled presentations in this date range",
  });
  await expect(cancelled).toContainText(`${title} corrected`);
  await cancelled
    .getByRole("listitem")
    .filter({ hasText: `${title} corrected` })
    .getByRole("link", { name: "Edit presentation" })
    .click();
  await page
    .getByRole("button", { name: "Delete presentation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  expect(
    localSql(
      `select deleted_at is null from public.presentations where id='${p.id}'`,
    ),
  ).toBe("t");
  await page
    .getByLabel("I confirm that I want to delete this presentation.")
    .check();
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Presentation deleted.");
  expect(
    localSql(
      `select deleted_at is not null from public.presentations where id='${p.id}'`,
    ),
  ).toBe("t");
  await page.goto(`/presentations/${p.id}`);
  await expect(
    page.getByRole("heading", { name: "Let’s get you back on track." }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("booked closures and stale admin forms show errors and preserve drafts and records", async ({
  page,
  account,
  archive,
  slots,
}) => {
  const p = archive.presentation({
    title: `${archive.tag} Stale administration`,
    offset: 0,
  });
  const target = slots.create(1);
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  await signIn(page, account, `/schedule/manage?start=${p.date}`);
  const slot = page.getByRole("region", {
    name: `Slot ${p.number} on ${p.date}`,
    exact: true,
  });
  await slot.getByLabel("Open for bookings").uncheck();
  await slot.getByRole("button", { name: "Save slot" }).click();
  await expect(slot.getByRole("alert")).toContainText("Reschedule or cancel");
  const close = page.getByRole("form", { name: "Close a presentation date" });
  await close.getByRole("checkbox").check();
  await close.getByRole("button", { name: "Close date", exact: true }).click();
  await expect(close.getByRole("alert")).toContainText(
    "Reschedule or cancel every presentation",
  );
  await page.goto(`/presentations/${p.id}/edit`);
  await page.getByLabel("Presentation title").fill("My unsaved correction");
  await page.getByLabel("Presentation date and slot").selectOption(target.id);
  localSql(
    `update public.presentations set title='Newer correction' where id='${p.id}'`,
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "changed after you opened it",
  );
  await expect(page.getByLabel("Presentation title")).toHaveValue(
    "My unsaved correction",
  );
  await expect(page.getByLabel("Presentation date and slot")).toHaveValue(
    target.id,
  );
  await page
    .getByRole("button", { name: "Delete presentation", exact: true })
    .click();
  await page
    .getByLabel("I confirm that I want to delete this presentation.")
    .check();
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(
    page.getByRole("form", { name: "Confirm deletion" }).getByRole("alert"),
  ).toContainText("changed after you opened it");
  expect(
    localSql(
      `select title, deleted_at is null from public.presentations where id='${p.id}'`,
    ),
  ).toBe("Newer correction|t");
});

test("employees cannot open schedule administration or edit completed metadata", async ({
  page,
  account,
  archive,
}) => {
  const p = archive.presentation({
    title: `${archive.tag} User cannot administer`,
  });
  await signIn(page, account, "/schedule");
  await expect(
    page.getByRole("link", { name: "Manage schedule", exact: true }),
  ).toHaveCount(0);
  // App Router can stream its not-found UI with HTTP 200. Assert no admin
  // content reaches the user; API/RPC tests assert actual authorization errors.
  await page.goto("/schedule/manage");
  await expect(
    page.getByRole("heading", { name: "Let’s get you back on track." }),
  ).toBeVisible();
  await expect(
    page.getByRole("form", { name: "Add a presentation slot" }),
  ).toHaveCount(0);
  await page.goto(`/presentations/${p.id}`);
  await expect(
    page.getByRole("link", { name: "Edit presentation", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/presentations/${p.id}/edit`);
  await expect(
    page.getByRole("heading", { name: "Let’s get you back on track." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
});
