import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, localSql } from "./admin-fixtures";
import { isUuid } from "../../src/lib/auth/redirects";
import {
  addCalendarDays,
  calendarWeek,
  formatPresentationDate,
} from "../../src/lib/schedule/dates";

function weekAfter(date: string) {
  const monday = addCalendarDays(calendarWeek(date).start, 7);
  return {
    monday,
    tuesday: addCalendarDays(monday, 1),
    wednesday: addCalendarDays(monday, 2),
    sunday: addCalendarDays(monday, 6),
  };
}

test("admins generate two weekly slots, move booked presentations together, and preserve the day on extension", async ({
  page,
  account,
  adminDates,
}, info) => {
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  const dates = weekAfter(adminDates.start);
  await signIn(page, account, `/schedule/manage?start=${dates.monday}`);
  const extend = page.getByRole("form", { name: "Extend weekly schedule" });
  await extend.getByLabel("Start date").fill(dates.monday);
  await extend.getByLabel("End date").fill(dates.sunday);
  await extend
    .getByRole("button", { name: "Extend schedule", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("2 slots added.");
  const ids =
    localSql(`insert into public.presentations(slot_id,presenter_user_id,title)
    select id,'${account.id}','Weekly move '||slot_number from public.presentation_slots where presentation_date='${dates.tuesday}' returning id`)
      .split("\n")
      .filter(isUuid);
  expect(ids).toHaveLength(2);
  await page.reload();
  const move = page.getByRole("form", {
    name: "Change presentation day",
    exact: true,
  });
  await move
    .getByLabel("Current presentation date")
    .selectOption(dates.tuesday);
  await expect(move).toContainText(
    "Move all 2 slots and 2 booked presentations",
  );
  await move.getByLabel("New presentation date").fill(dates.wednesday);
  await move
    .getByRole("button", { name: "Change presentation day", exact: true })
    .click();
  expect(
    localSql(
      `select count(*) from public.presentation_slots where presentation_date='${dates.wednesday}'`,
    ),
  ).toBe("0");
  await move.getByRole("checkbox").check();
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
    path: info.outputPath("change-presentation-day.png"),
    fullPage: true,
  });
  await move
    .getByRole("button", { name: "Change presentation day", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Presentation day changed.",
  );
  expect(
    localSql(
      `select count(*) from public.presentation_slots where presentation_date='${dates.tuesday}'`,
    ),
  ).toBe("0");
  for (const [i, id] of ids.entries()) {
    await page.goto(`/presentations/${id}`);
    await expect(
      page.getByRole("heading", { name: /Weekly move/ }),
    ).toBeVisible();
    await expect(
      page
        .getByText(formatPresentationDate(dates.wednesday), { exact: false })
        .first(),
    ).toBeVisible();
    expect(
      localSql(
        `select s.presentation_date,p.revision from public.presentations p join public.presentation_slots s on s.id=p.slot_id where p.id='${ids[i]}'`,
      ),
    ).toBe(`${dates.wednesday}|2`);
  }
  await page.goto(`/schedule/manage?start=${dates.monday}`);
  await extend.getByLabel("Start date").fill(dates.monday);
  await extend.getByLabel("End date").fill(dates.sunday);
  await extend
    .getByRole("button", { name: "Extend schedule", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("0 slots added.");
});

test("day-change forms preserve the selection and focus feedback for stale bookings and closed or occupied destinations", async ({
  page,
  account,
  adminDates,
}) => {
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  const dates = weekAfter(adminDates.start);
  localSql(
    `insert into public.presentation_slots(presentation_date,slot_number) values ('${dates.tuesday}',1),('${dates.tuesday}',2)`,
  );
  await signIn(page, account, `/schedule/manage?start=${dates.monday}`);
  const move = page.getByRole("form", {
    name: "Change presentation day",
    exact: true,
  });
  await move.getByLabel("New presentation date").fill(dates.wednesday);
  await move.getByRole("checkbox").check();
  localSql(
    `insert into public.presentations(slot_id,presenter_user_id,title) select id,'${account.id}','New booking' from public.presentation_slots where presentation_date='${dates.tuesday}' and slot_number=1`,
  );
  await move
    .getByRole("button", { name: "Change presentation day", exact: true })
    .click();
  await expect(move.getByRole("alert")).toContainText(
    "slots or bookings changed",
  );
  await expect(move.getByRole("alert")).toBeFocused();
  await expect(move.getByLabel("New presentation date")).toHaveValue(
    dates.wednesday,
  );
  await move.getByRole("link", { name: "Reload latest schedule" }).click();
  localSql(
    `insert into public.schedule_date_closures(presentation_date) values ('${dates.wednesday}')`,
  );
  await move.getByLabel("New presentation date").fill(dates.wednesday);
  await move.getByRole("checkbox").check();
  await move
    .getByRole("button", { name: "Change presentation day", exact: true })
    .click();
  await expect(move.getByRole("alert")).toContainText("date is closed");
  localSql(
    `delete from public.schedule_date_closures where presentation_date='${dates.wednesday}'; insert into public.presentation_slots(presentation_date,slot_number) values ('${dates.wednesday}',1)`,
  );
  await move
    .getByRole("button", { name: "Change presentation day", exact: true })
    .click();
  await expect(move.getByRole("alert")).toContainText(
    "destination already has slots",
  );
  expect(
    localSql(
      `select count(*) from public.presentation_slots where presentation_date='${dates.tuesday}'`,
    ),
  ).toBe("2");
});
