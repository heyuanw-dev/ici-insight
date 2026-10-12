import AxeBuilder from "@axe-core/playwright";
import { test, expect, signIn, localSql } from "./files-fixtures";
import { fileTypes } from "../../src/lib/files/config";
import { pdfBytes, powerpointBytes } from "../fixtures/slides";

// Real Storage and registration transactions, with only selected failures delayed
// or interrupted. Each fixture cleans only this test's accounts, rows and objects.
test("registration uploads optional PowerPoint and a PDF larger than the Server Action limit", async ({
  page,
  account,
  slots,
}, info) => {
  const slot = slots.create(7);
  await signIn(page, account, `/presentations/new?slot=${slot.id}`);
  const title = `Slides at registration ${slot.id.slice(0, 8)}`;
  await page.getByLabel("Presentation title").fill(title);
  const pptx = powerpointBytes();
  const pdf = pdfBytes(
    `Ready before presenting ${" ".repeat(2 * 1024 * 1024)}`,
  );
  await page.getByLabel("Choose .pptx file").setInputFiles({
    name: "Early slides.pptx",
    mimeType: fileTypes.powerpoint.mime,
    buffer: pptx,
  });
  await page.getByLabel("Choose .pdf file").setInputFiles({
    name: "Early preview.pdf",
    mimeType: fileTypes.pdf.mime,
    buffer: pdf,
  });
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
    path: info.outputPath("registration-slides.png"),
    fullPage: true,
  });
  const metadataRequests: number[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/presentations/new"
    )
      metadataRequests.push(request.postDataBuffer()?.byteLength ?? 0);
  });
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your presentation is scheduled.",
  );
  expect(metadataRequests).toHaveLength(1);
  expect(metadataRequests[0]).toBeLessThan(10000);
  const id = localSql(
    `select id from public.presentations where slot_id='${slot.id}' and presenter_user_id='${account.id}'`,
  );
  expect(
    localSql(
      `select count(*) from public.presentation_files where presentation_id='${id}'`,
    ),
  ).toBe("2");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(
    page.getByText("Upcoming presentation", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTitle("Presentation PDF slides")).toBeVisible();
  expect(
    (
      await (
        await page.request.get(`/api/presentations/${id}/files/powerpoint`)
      ).body()
    ).equals(pptx),
  ).toBe(true);
  expect(
    (
      await (
        await page.request.get(`/api/presentations/${id}/files/pdf`)
      ).body()
    ).equals(pdf),
  ).toBe(true);
});

test("invalid files do not reserve a slot and booking conflicts never start uploads", async ({
  page,
  account,
  slots,
}) => {
  const slot = slots.create(2);
  await signIn(page, account, `/presentations/new?slot=${slot.id}`);
  await page.getByLabel("Presentation title").fill("A preserved draft");
  const input = page.getByLabel("Choose .pdf file");
  await input.setInputFiles({
    name: "Wrong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("wrong"),
  });
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(input).toBeFocused();
  await expect(
    page.getByText("Choose a .pdf file.", { exact: true }),
  ).toBeVisible();
  expect(
    localSql(
      `select count(*) from public.presentations where slot_id='${slot.id}'`,
    ),
  ).toBe("0");
  await input.setInputFiles({
    name: "Ready.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes(),
  });
  await page.getByLabel("Short description").fill("x".repeat(501));
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page.getByLabel("Short description")).toBeFocused();
  expect(
    await input.evaluate(
      (element: HTMLInputElement) => element.files?.[0]?.name,
    ),
  ).toBe("Ready.pdf");
  await page.getByLabel("Short description").fill("A valid description");
  localSql(
    `update public.presentation_slots set is_open=false where id='${slot.id}'`,
  );
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "This slot is now closed",
  );
  await expect(page.getByLabel("Presentation title")).toHaveValue(
    "A preserved draft",
  );
  expect(
    localSql(
      `select count(*) from public.presentations where slot_id='${slot.id}'`,
    ),
  ).toBe("0");
  expect(
    localSql(
      `select count(*) from public.presentation_file_uploads where uploaded_by='${account.id}'`,
    ),
  ).toBe("0");
});

test("partial upload failure keeps the booking and saved PowerPoint; retry uploads only the missing PDF", async ({
  page,
  account,
  slots,
}) => {
  const slot = slots.create();
  await signIn(page, account, `/presentations/new?slot=${slot.id}`);
  await page.getByLabel("Presentation title").fill("Retry registration slides");
  await page.getByLabel("Choose .pptx file").setInputFiles({
    name: "Saved.pptx",
    mimeType: fileTypes.powerpoint.mime,
    buffer: powerpointBytes(),
  });
  await page.getByLabel("Choose .pdf file").setInputFiles({
    name: "Retry.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes(),
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pattern = "**/api/presentations/*/files/uploads";
  let bookingPosts = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/presentations/new"
    )
      bookingPosts++;
  });
  await page.route(pattern, async (route) => {
    if (route.request().postDataJSON()?.kind !== "pdf") return route.continue();
    await gate;
    await route.abort("connectionfailed");
  });
  try {
    await page.getByRole("button", { name: "Confirm registration" }).click();
    await expect(page.getByRole("status")).toContainText("Your slot is booked");
    await expect(
      page.getByRole("button", { name: "Saving slides…" }),
    ).toBeDisabled();
    await expect(page.getByLabel("Presentation title")).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Your presentation is scheduled. Some slides could not be saved.",
  );
  await expect(
    page.getByText("Saved: Saved.pptx", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Choose .pdf file")).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const id = localSql(
    `select id from public.presentations where slot_id='${slot.id}'`,
  );
  const saved = localSql(
    `select id from public.presentation_files where presentation_id='${id}' and kind='powerpoint'`,
  );
  await page.unroute(pattern);
  await page.getByRole("button", { name: "Retry uploads" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your presentation is scheduled.",
  );
  expect(bookingPosts).toBe(1);
  expect(
    localSql(
      `select count(*) from public.presentations where slot_id='${slot.id}'`,
    ),
  ).toBe("1");
  expect(
    localSql(
      `select count(*) from public.presentation_files where presentation_id='${id}'`,
    ),
  ).toBe("2");
  expect(
    localSql(
      `select id from public.presentation_files where presentation_id='${id}' and kind='powerpoint'`,
    ),
  ).toBe(saved);
});

test("server rejects fake slide bytes but the presenter can continue and upload later before presenting", async ({
  page,
  account,
  slots,
}) => {
  const slot = slots.create(3);
  await signIn(page, account, `/presentations/new?slot=${slot.id}`);
  await page.getByLabel("Presentation title").fill("Add slides later");
  await page.getByLabel("Choose .pdf file").setInputFiles({
    name: "Fake.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html>not a PDF</html>"),
  });
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page.getByText(/Choose a valid PDF/)).toBeVisible();
  const id = localSql(
    `select id from public.presentations where slot_id='${slot.id}'`,
  );
  expect(
    localSql(
      `select count(*) from public.presentation_files where presentation_id='${id}'`,
    ),
  ).toBe("0");
  await page
    .getByRole("link", { name: "Continue without remaining slides" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your presentation is scheduled.",
  );
  await page
    .getByRole("link", { name: "Add slides later", exact: true })
    .click();
  await page.getByLabel("Choose .pdf file").setInputFiles({
    name: "Ready.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes(),
  });
  await page
    .getByRole("button", { name: "Upload PDF preview", exact: true })
    .click();
  await expect(
    page.getByText("PDF preview saved successfully.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTitle("Presentation PDF slides")).toBeVisible();
});
