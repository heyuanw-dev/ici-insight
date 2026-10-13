import assert from "node:assert/strict";
import { test } from "node:test";
import {
  vancouverToday,
  addCalendarDays,
  formatPresentationDate,
  scheduleWindow,
  schedulePageForDate,
  calendarWeek,
} from "../../src/lib/schedule/dates";
import {
  validateRegistration,
  bookingError,
} from "../../src/lib/schedule/registration";

test("presentation weeks run Monday to Sunday across year and daylight-saving boundaries", () => {
  for (const date of ["2026-12-28", "2026-12-29", "2027-01-03"])
    assert.deepEqual(calendarWeek(date), {
      start: "2026-12-28",
      end: "2027-01-03",
    });
  assert.deepEqual(calendarWeek("2026-11-01"), {
    start: "2026-10-26",
    end: "2026-11-01",
  });
  assert.deepEqual(calendarWeek("0001-01-01"), {
    start: "0001-01-01",
    end: "0001-01-07",
  });
  assert.deepEqual(calendarWeek("9999-12-31"), {
    start: "9999-12-27",
    end: "9999-12-31",
  });
});

test("Vancouver dates change at local midnight, independent of UTC and daylight-saving changes", () => {
  for (const [instant, date] of [
    ["2026-10-05T06:59:59Z", "2026-10-04"],
    ["2026-10-05T07:00:00Z", "2026-10-05"],
    ["2024-03-11T06:59:59Z", "2024-03-10"],
    ["2024-03-11T07:00:00Z", "2024-03-11"],
    ["2024-11-04T07:59:59Z", "2024-11-03"],
    ["2024-11-04T08:00:00Z", "2024-11-04"],
  ] as const)
    assert.equal(vancouverToday(new Date(instant)), date);
  assert.equal(addCalendarDays("2024-03-09", 2), "2024-03-11");
  assert.equal(addCalendarDays("2024-11-02", 2), "2024-11-04");
  assert.match(formatPresentationDate("2024-03-10"), /Sunday, March 10, 2024/);
});

test("12-week windows start today, have no gaps, and reach every later created slot", () => {
  const today = "2026-10-05";
  const first = scheduleWindow(today, undefined, "2027-04-04");
  assert.deepEqual(first, {
    page: 0,
    start: today,
    end: "2026-12-28",
    hasNext: true,
  });
  assert.equal(schedulePageForDate("2026-12-27", today), 0);
  assert.equal(schedulePageForDate("2026-12-28", today), 1);
  assert.equal(scheduleWindow(today, "1", "2027-04-04").start, first.end);
  assert.equal(scheduleWindow(today, "999999", "2027-04-04").page, 2);
  for (const value of ["-1", "Infinity", "1.5", ["1"], "invalid"])
    assert.equal(scheduleWindow(today, value, "2027-04-04").page, 0);
  assert.equal(scheduleWindow(today, "1", null).hasNext, false);
});

function form() {
  const data = new FormData();
  data.set("slotId", "11111111-1111-4111-8111-111111111111");
  data.set("title", " A useful topic ");
  return data;
}
test("registration requires a slot/title, allows empty optional fields and counts Unicode characters correctly", () => {
  const data = form();
  assert.equal(validateRegistration(data).valid, true);
  assert.equal(validateRegistration(data).values.title, "A useful topic");
  data.set("description", "🔬".repeat(500));
  assert.equal(validateRegistration(data).valid, true);
  data.set("description", "🔬".repeat(501));
  assert.ok(validateRegistration(data).errors.description);
  data.set("title", " \t\n");
  data.set("slotId", "fake");
  data.set("categoryId", "fake");
  const result = validateRegistration(data);
  assert.ok(result.errors.title);
  assert.ok(result.errors.slot);
  assert.ok(result.errors.categoryId);
});
test("reference links must be complete HTTP(S) URLs; arbitrary presenter/date fields cannot override identity", () => {
  const data = form();
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "ftp://files.test",
    "//example.test",
    "https://",
    "https://user:password@example.test",
    "https://example.test/has space",
    "https://example.test\\evil",
    "https:example.test",
  ]) {
    data.set("referenceUrl", url);
    assert.ok(validateRegistration(data).errors.referenceUrl, url);
  }
  data.set("referenceUrl", "https://example.test/paper?q=ai#results");
  data.set("presenter_user_id", "someone-else");
  data.set("presentation_date", "1900-01-01");
  const result = validateRegistration(data);
  assert.equal(result.valid, true);
  assert.equal(result.url, "https://example.test/paper?q=ai#results");
  assert.equal("presenter_user_id" in result.values, false);
  assert.match(
    bookingError("slot_booked", "23505").errors!.slot!,
    /just been booked/,
  );
  assert.match(
    bookingError("raw database credentials should not leak").message!,
    /couldn’t confirm/,
  );
});
