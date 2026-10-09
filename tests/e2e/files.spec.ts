import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, localSql } from "./files-fixtures";
import { pdfBytes, powerpointBytes } from "../fixtures/slides";
import { fileTypes } from "../../src/lib/files/config";

test("presenter uploads and replaces historical slides, previews PDF, and downloads the exact original", async ({
  page,
  account,
  archive,
}, info) => {
  const viewerPolicyErrors: string[] = [];
  page.on("console", (message) => {
    if (
      /violates.*Content Security Policy|Refused to (?:load|frame)/i.test(
        message.text(),
      )
    )
      viewerPolicyErrors.push(message.text());
  });
  const p = archive.presentation({ title: `${archive.tag} Files` });
  const originalMetadata = localSql(
    `select row_to_json(p) from public.presentations p where id='${p.id}'`,
  );
  await signIn(page, account, `/presentations/${p.id}`);
  await expect(
    page.getByText("Slides are not yet available.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Edit presentation", exact: true }),
  ).toHaveCount(0);
  const pptx = powerpointBytes();
  await page.getByLabel("Choose .pptx file").setInputFiles({
    name: "Original slides.pptx",
    mimeType: fileTypes.powerpoint.mime,
    buffer: pptx,
  });
  await page
    .getByRole("button", { name: "Upload PowerPoint", exact: true })
    .click();
  await expect(
    page.getByText("PowerPoint saved successfully.", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PowerPoint" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Original slides.pptx");
  expect(await readFile((await download.path())!)).toEqual(pptx);
  await page.getByLabel("Choose .pptx file").setInputFiles({
    name: "Revised slides.pptx",
    mimeType: fileTypes.powerpoint.mime,
    buffer: pptx,
  });
  await page
    .getByRole("button", { name: "Replace PowerPoint", exact: true })
    .click();
  await expect(page.getByText(/Current: Revised slides.pptx/)).toBeVisible();
  const pdf = pdfBytes();
  await page.getByLabel("Choose .pdf file").setInputFiles({
    name: "Preview.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page
    .getByRole("button", { name: "Upload PDF preview", exact: true })
    .click();
  await expect(
    page.getByText("PDF preview saved successfully.", { exact: true }),
  ).toBeVisible();
  const iframe = page.getByTitle("Presentation PDF slides");
  await expect(iframe).toBeVisible();
  const oldPreview = await iframe.getAttribute("src");
  const preview = await page.request.get(
    `/api/presentations/${p.id}/files/pdf`,
  );
  expect(preview.status()).toBe(200);
  expect(preview.headers()["content-type"]).toBe("application/pdf");
  expect(preview.headers()["content-disposition"]).toContain("inline");
  expect(preview.headers()["cache-control"]).toContain("no-store");
  expect(await preview.body()).toEqual(pdf);
  const ranged = await page.request.get(
    `/api/presentations/${p.id}/files/pdf`,
    { headers: { Range: "bytes=0-7" } },
  );
  expect(ranged.status()).toBe(206);
  expect(await ranged.body()).toEqual(pdf.subarray(0, 8));
  expect(ranged.headers()["content-range"]).toBe(`bytes 0-7/${pdf.length}`);
  const second = pdfBytes("Updated slides");
  await page.getByLabel("Choose .pdf file").setInputFiles({
    name: "Revised.pdf",
    mimeType: "application/pdf",
    buffer: second,
  });
  const changed = page.waitForResponse(
    (response) =>
      response.url().includes("/files/uploads/") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Replace PDF preview", exact: true })
    .click();
  expect((await changed).status()).toBe(200);
  await expect(page.getByText(/Current: Revised.pdf/)).toBeVisible();
  expect(
    (
      await page.request.get(oldPreview!, { headers: { Range: "bytes=0-7" } })
    ).status(),
  ).toBe(409);
  expect(
    await (
      await page.request.get(`/api/presentations/${p.id}/files/pdf`)
    ).body(),
  ).toEqual(second);
  expect(
    localSql(
      `select row_to_json(p) from public.presentations p where id='${p.id}'`,
    ),
  ).toBe(originalMetadata);
  expect(
    (
      await new AxeBuilder({ page })
        .exclude("iframe")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(viewerPolicyErrors).toEqual([]);
  await page.screenshot({
    path: info.outputPath("presentation-files.png"),
    fullPage: true,
  });
  await page.goto(`/archive?q=${archive.tag}`);
  await expect(page.getByRole("article")).toContainText("PowerPoint uploaded");
  await expect(page.getByRole("article")).toContainText("PDF uploaded");
});

test("invalid and interrupted replacements preserve the current file with understandable retry feedback", async ({
  page,
  account,
  archive,
}) => {
  const p = archive.presentation({
    title: `${archive.tag} Invalid files`,
    offset: 0,
  });
  await signIn(page, account, "/schedule");
  await page
    .getByRole("link", { name: `${archive.tag} Invalid files`, exact: true })
    .click();
  await expect(page).toHaveURL(`/presentations/${p.id}`);
  await page.getByLabel("Choose .pdf file").setInputFiles({
    name: "Working.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes(),
  });
  await page
    .getByRole("button", { name: "Upload PDF preview", exact: true })
    .click();
  await expect(page.getByText(/Current: Working.pdf/)).toBeVisible();
  const current = localSql(
    `select id from public.presentation_files where presentation_id='${p.id}'`,
  );
  await page.getByLabel("Choose .pdf file").setInputFiles({
    name: "Fake.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html>not a pdf</html>"),
  });
  await page
    .getByRole("button", { name: "Replace PDF preview", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Choose a valid PDF",
  );
  expect(
    localSql(
      `select id from public.presentation_files where presentation_id='${p.id}'`,
    ),
  ).toBe(current);
  await page.route("**/storage/v1/object/upload/sign/**", (route) =>
    route.abort("connectionfailed"),
  );
  await page.getByLabel("Choose .pdf file").setInputFiles({
    name: "Retry.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes("Retry"),
  });
  await page
    .getByRole("button", { name: "Replace PDF preview", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "connection was interrupted",
  );
  expect(
    localSql(
      `select id from public.presentation_files where presentation_id='${p.id}'`,
    ),
  ).toBe(current);
  await page.unroute("**/storage/v1/object/upload/sign/**");
  await page
    .getByRole("button", { name: "Replace PDF preview", exact: true })
    .click();
  await expect(page.getByText(/Current: Retry.pdf/)).toBeVisible();
  await page.getByLabel("Choose .pptx file").setInputFiles({
    name: "wrong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("wrong"),
  });
  await page
    .getByRole("button", { name: "Upload PowerPoint", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Choose a .pptx file",
  );
});
