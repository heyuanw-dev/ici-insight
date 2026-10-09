import assert from "node:assert/strict";
import { test } from "node:test";
import { dateInput, positiveInteger } from "../../src/lib/admin/validation";
import { safeReturnPath } from "../../src/lib/auth/redirects";

test("admin forms reject malformed dates and unsafe integer fields before calling database RPCs", () => {
  for (const value of [
    "2025-02-29",
    "2026-04-31",
    "0000-01-01",
    "2026-1-01",
    "infinity",
    ["2026-01-01"],
    null,
  ])
    assert.equal(dateInput(value), false);
  for (const value of [
    "2024-02-29",
    "2026-03-08",
    "2026-11-01",
    "0001-01-01",
    "9999-12-31",
  ])
    assert.equal(dateInput(value), true);
  for (const value of [
    "0",
    "-1",
    "1.5",
    "1e3",
    "2147483648",
    "999999999999999999999",
    "",
    null,
  ])
    assert.equal(positiveInteger(value), null);
  assert.equal(positiveInteger("2147483647"), 2147483647);
  assert.equal(positiveInteger("32767", 32767), 32767);
  assert.equal(positiveInteger("32768", 32767), null);
  assert.equal(
    safeReturnPath("/schedule/manage?start=2026-10-08"),
    "/schedule/manage?start=2026-10-08",
  );
});
