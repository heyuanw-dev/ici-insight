import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  archiveHref,
  archiveReturnPath,
  isCalendarDate,
  parseArchiveFilters,
} from "../../src/lib/archive/filters";

test("archive filters normalize words and preserve valid, inclusive date bounds", () => {
  const presenter = randomUUID(),
    category = randomUUID();
  const result = parseArchiveFilters({
    q: "  Model\n  eval ",
    presenter,
    category,
    year: "2024",
    from: "2024-02-29",
    to: "2024-02-29",
    page: "2",
  });
  assert.equal(result.valid, true);
  assert.equal(result.filters.q, "Model eval");
  assert.equal(result.page, 2);
  assert.equal(result.hasFilters, true);
  assert.equal(isCalendarDate("2023-02-29"), false);
  assert.equal(isCalendarDate("2024-02-29"), true);
  for (const date of [
    "2024-04-31",
    "2024-13-01",
    "2024-2-01",
    "0000-01-01",
    "infinity",
    "2024-01-01T00:00:00Z",
  ])
    assert.equal(isCalendarDate(date), false);
});

test("invalid search/filter input fails explicitly and malformed pages normalize safely", () => {
  const bad = parseArchiveFilters({
    q: "x".repeat(201),
    presenter: "bad",
    category: "bad",
    year: "10000",
    from: "2024-02-30",
    to: "yesterday",
  });
  assert.equal(bad.valid, false);
  assert.equal(Object.keys(bad.errors).length, 6);
  assert.equal(parseArchiveFilters({ q: "🔬".repeat(200) }).valid, true);
  assert.ok(
    parseArchiveFilters({ from: "2025-02-01", to: "2025-01-01" }).errors.to,
  );
  for (const key of ["q", "presenter", "category", "year", "from", "to"])
    assert.equal(parseArchiveFilters({ [key]: ["a", "b"] }).valid, false);
  for (const page of ["0", "-1", "1.5", "Infinity", "9999999999", ["1", "2"]])
    assert.equal(parseArchiveFilters({ page }).page, 1);
});

test("archive pagination retains and encodes filters; return links cannot leave the archive", () => {
  const input = parseArchiveFilters({
    q: "R&D 100%_precision",
    presenter: randomUUID(),
    year: "2025",
    from: "2025-01-01",
    to: "2025-12-31",
  });
  const path = archiveHref(input.filters, 3);
  const url = new URL(path, "https://workspace.invalid");
  assert.equal(url.pathname, "/archive");
  assert.equal(url.searchParams.get("q"), input.filters.q);
  assert.equal(url.searchParams.get("presenter"), input.filters.presenter);
  assert.equal(url.searchParams.get("from"), "2025-01-01");
  assert.equal(url.searchParams.get("to"), "2025-12-31");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(archiveReturnPath(path), path);
  for (const value of [
    "https://evil.test",
    "//evil.test/archive",
    "/schedule",
    "/archive-fake",
    "/archive\\evil",
    "/archive?bad=\nvalue",
    ["/archive"],
    undefined,
  ])
    assert.equal(archiveReturnPath(value), "/archive");
  assert.equal(archiveHref(parseArchiveFilters({}).filters), "/archive");
});
