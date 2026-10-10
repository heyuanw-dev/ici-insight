import { test, expect, signIn, localSql } from "./archive-fixtures";

test("pages use fresh trusted CSP nonces, private responses, and block injected script", async ({
  page,
  account,
  archive,
}) => {
  const title = `${archive.tag} <script>window.injected=true</script>`;
  const p = archive.presentation({
    title,
    description: '<img src=x onerror="window.injected=true">',
  });
  await signIn(page, account, `/presentations/${p.id}`);
  await page.setExtraHTTPHeaders({
    "x-nonce": "attacker-nonce",
    "Content-Security-Policy": "script-src * 'unsafe-inline'",
  });
  const response = (await page.reload())!;
  const headers = response.headers();
  const policy = headers["content-security-policy"]!;
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  expect(nonce).toBeTruthy();
  expect(nonce).not.toBe("attacker-nonce");
  expect(policy).toContain("script-src-attr 'none'");
  expect(policy).not.toContain("unsafe-eval");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["cache-control"]).toContain("no-store");
  const scripts = await page
    .locator("script")
    .evaluateAll((elements) =>
      elements.map((el) => (el as HTMLScriptElement).nonce),
    );
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every((value) => value === nonce)).toBe(true);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
  // Inject in the HTTP document: DevTools evaluation can bypass CSP.
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/violates.*Content Security Policy/i.test(message.text()))
      violations.push(message.text());
  });
  await page.route(`**/presentations/${p.id}`, async (route) => {
    const upstream = await route.fetch();
    const body = (await upstream.text()).replace(
      "</head>",
      "<script>window.injected=true</script></head>",
    );
    await route.fulfill({ response: upstream, body });
  });
  const next = (await page.reload())!.headers()["content-security-policy"]!;
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect.poll(() => violations.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
  expect(/'nonce-([^']+)'/.exec(next)?.[1]).not.toBe(nonce);
});

test("upload metadata rejects oversized, non-JSON, malformed, and cross-origin requests without preparing objects", async ({
  page,
  account,
  archive,
}) => {
  const p = archive.presentation({ title: `${archive.tag} Bounded uploads` });
  await signIn(page, account, `/presentations/${p.id}`);
  const url = `/api/presentations/${p.id}/files/uploads`;
  for (const input of [
    {
      body: "{}",
      type: "text/plain",
      origin: "http://127.0.0.1:3100",
      status: 415,
    },
    {
      body: "{",
      type: "application/json",
      origin: "http://127.0.0.1:3100",
      status: 400,
    },
    {
      body: JSON.stringify({ name: "a".repeat(4096) }),
      type: "application/json",
      origin: "http://127.0.0.1:3100",
      status: 413,
    },
    {
      body: "{}",
      type: "application/json",
      origin: "https://evil.example.test",
      status: 403,
    },
  ]) {
    const response = await page.request.post(url, {
      data: input.body,
      headers: { "Content-Type": input.type, Origin: input.origin },
    });
    expect(response.status()).toBe(input.status);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(typeof (await response.json()).error).toBe("string");
  }
  expect(
    localSql(
      `select count(*) from public.presentation_file_uploads where presentation_id='${p.id}'`,
    ),
  ).toBe("0");
});

test("Server Actions reject a cross-origin booking without reserving its slot", async ({
  page,
  account,
  slots,
}) => {
  const slot = slots.create();
  const path = `/presentations/new?slot=${slot.id}`;
  await signIn(page, account, path);
  await page.getByLabel("Presentation title").fill("Cross-origin attempt");
  let status = 0;
  await page.route("**/presentations/new?*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const response = await page.request.post(request.url(), {
      headers: { ...request.headers(), origin: "https://evil.example.test" },
      data: request.postDataBuffer()!,
    });
    status = response.status();
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect.poll(() => status).toBe(500);
  expect(
    localSql(
      `select count(*) from public.presentations where slot_id='${slot.id}'`,
    ),
  ).toBe("0");
});

test("unauthenticated API errors are private and do not reveal presentation existence", async ({
  request,
}) => {
  const response = await request.get(
    "/api/presentations/00000000-0000-4000-8000-000000000000/files/pdf",
  );
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
