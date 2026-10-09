import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn } from "./archive-fixtures";

test("archive orders completed presentations, omits hidden/current records, and opens safe metadata details", async ({
  page,
  account,
  archive,
}, info) => {
  const tag = archive.tag,
    category = archive.category(`Vision ${tag}`);
  const olderTitle = `${tag} Older topic`,
    title = `${tag} <img src=x onerror=alert(1)> Diffusion`;
  const older = archive.presentation({ title: olderTitle, offset: -10 });
  const newest = archive.presentation({
    title,
    category,
    description: "Practical robot navigation.",
    referenceUrl: "https://example.test/research",
    pdf: true,
    powerpoint: true,
  });
  const sameDayTitle = `${tag} Second slot`;
  archive.presentation({ title: sameDayTitle });
  archive.presentation({ title: `${tag} Today`, offset: 0 });
  archive.presentation({ title: `${tag} Future`, offset: 1 });
  archive.presentation({
    title: `${tag} Cancelled`,
    offset: -2,
    cancelled: true,
  });
  const deleted = archive.presentation({
    title: `${tag} Deleted`,
    offset: -3,
    deleted: true,
  });
  const route = `/archive?q=${tag}`;
  await signIn(page, account, route);
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([
    title,
    sameDayTitle,
    olderTitle,
  ]);
  await expect(page.getByRole("status")).toContainText("of 3 presentations");
  await expect(
    page.getByRole("article", { name: olderTitle, exact: true }),
  ).toContainText("Slides are not yet available.");
  await expect(
    page.getByRole("article", { name: title, exact: true }),
  ).toContainText("PowerPoint uploaded");
  await expect(
    page.getByRole("article", { name: title, exact: true }),
  ).toContainText("PDF uploaded");
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
    path: info.outputPath("archive.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(
    page.getByText("Practical robot navigation.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /https:\/\/example.test\/research/ }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    page.getByRole("link", { name: "Edit presentation", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Download PowerPoint" }),
  ).toBeVisible();
  await expect(page.locator("main img")).toHaveCount(0);
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
    path: info.outputPath("presentation-details.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Back to archive" }).click();
  await expect(page).toHaveURL(route);
  await expect(page.getByLabel("Search presentations")).toHaveValue(tag);
  await page.goto(`/presentations/${older.id}`);
  for (const absent of ["Category", "About this presentation", "Reference"])
    await expect(page.getByText(absent, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Slides are not yet available.", { exact: true }),
  ).toBeVisible();
  await page.goto(`/presentations/${newest.id}?returnTo=https://evil.test`);
  await expect(
    page.getByRole("link", { name: "Back to archive" }),
  ).toHaveAttribute("href", "/archive");
  await page.goto(`/presentations/${deleted.id}`);
  await expect(
    page.getByRole("heading", { name: "Let’s get you back on track." }),
  ).toBeVisible();
});

test("partial search, combined filters, validation, empty results, and browser history preserve the search context", async ({
  page,
  account,
  archive,
}) => {
  const tag = archive.tag,
    cat = archive.category(`Legacy Vision ${tag}`, false),
    former = archive.formerPresenter(`Former ${tag}`);
  const current = archive.presentation({
    title: `${tag} Diffusion 100%_precision`,
    category: cat,
    description: "Robot navigation",
    offset: -1,
  });
  const old = archive.presentation({
    title: `${tag} Older graph`,
    presenter: former,
    category: cat,
    offset: -400,
  });
  archive.presentation({ title: `${tag} Uncategorised`, offset: -10 });
  await signIn(page, account, `/archive?q=${tag}`);
  for (const [term, expected] of [
    ["DIFFUS", 1],
    ["former", 1],
    ["NAVIG", 1],
    ["VISI", 2],
    ["%_", 1],
  ] as const) {
    await page.getByLabel("Search presentations").fill(`${tag} ${term}`);
    await page
      .getByRole("button", { name: "Search archive", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("q") === `${tag} ${term}`,
    );
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(expected);
  }
  await page.getByLabel("Search presentations").fill(tag);
  await page.getByLabel("Presenter", { exact: true }).selectOption(former);
  await page.getByLabel("Category", { exact: true }).selectOption(cat);
  await page
    .getByLabel("Year", { exact: true })
    .selectOption(old.date.slice(0, 4));
  await page.getByLabel("From date").fill(old.date);
  await page.getByLabel("To date").fill(old.date);
  await page
    .getByRole("button", { name: "Search archive", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([
    `${tag} Older graph`,
  ]);
  await page.reload();
  await expect(page.getByLabel("Presenter", { exact: true })).toHaveValue(
    former,
  );
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue(cat);
  await expect(page.getByLabel("From date")).toHaveValue(old.date);
  await page.getByRole("link", { name: "Clear search and filters" }).click();
  await expect(page).toHaveURL("/archive");
  await expect(page.getByLabel("Search presentations")).toHaveValue("");
  await expect(page.getByLabel("Presenter", { exact: true })).toHaveValue("");
  await page.goBack();
  await expect(page.getByLabel("Presenter", { exact: true })).toHaveValue(
    former,
  );
  await page.goto(`/archive?q=${tag}&from=${current.date}&to=${old.date}`);
  await expect(
    page.getByText("The end date must be on or after the start date.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  await page.goto(`/archive?presenter=invalid&q=${tag}`);
  await expect(
    page.getByText("Choose a valid presenter.", { exact: true }),
  ).toBeVisible();
  await page.goto(`/archive?q=${"x".repeat(201)}`);
  await expect(
    page.getByText("Keep your search to 200 characters or fewer.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`/archive?q=${tag}-nothing-matches`);
  await expect(
    page.getByRole("heading", {
      name: "No presentations match your search.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Show all presentations" }),
  ).toBeVisible();
});

test("pagination is stable and retains every filter through details, back links, and out-of-range pages", async ({
  page,
  account,
  archive,
}) => {
  const tag = archive.tag,
    category = archive.category(`Pagination ${tag}`);
  const records = Array.from({ length: 13 }, (_, index) =>
    archive.presentation({
      title: `${tag} Topic ${String(index + 1).padStart(2, "0")}`,
      offset: -5,
      category,
    }),
  );
  const first = records[0]!;
  const params = new URLSearchParams({
    q: tag,
    presenter: account.id,
    category,
    year: first.date.slice(0, 4),
    from: first.date,
    to: first.date,
  });
  await signIn(page, account, `/archive?${params}`);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(12);
  await expect(page.getByRole("status")).toContainText("Showing 1–12 of 13");
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([
    `${tag} Topic 13`,
  ]);
  const secondPage = new URL(page.url());
  for (const [key, value] of params)
    expect(secondPage.searchParams.get(key)).toBe(value);
  expect(secondPage.searchParams.get("page")).toBe("2");
  await page
    .getByRole("link", { name: `${tag} Topic 13`, exact: true })
    .click();
  await page.getByRole("link", { name: "Back to archive" }).click();
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([
    `${tag} Topic 13`,
  ]);
  await page.goto(`/archive?${params}&page=999999`);
  await expect(
    page.getByRole("navigation", { name: "Archive pages" }),
  ).toContainText("Page 2 of 2");
  await page.getByRole("link", { name: "Previous page", exact: true }).click();
  await expect(page.getByRole("heading", { level: 3 }).first()).toHaveText(
    `${tag} Topic 01`,
  );
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(12);
});
