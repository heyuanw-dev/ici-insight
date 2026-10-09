import { createClient } from "@supabase/supabase-js";
import type { APIRequestContext } from "@playwright/test";
import { test, expect, signIn, localSql, cleanFiles } from "./files-fixtures";
import {
  createAccount,
  removeAccount,
  localSupabase,
  adminClient,
} from "./fixtures";
import { pdfBytes } from "../fixtures/slides";
import { slidesBucket } from "../../src/lib/files/config";

const origin = "http://127.0.0.1:3100";
const post = (request: APIRequestContext, url: string, data?: unknown) =>
  request.post(url, { headers: { Origin: origin }, data });
async function prepare(
  request: APIRequestContext,
  id: string,
  bytes: Buffer,
  expected: string | null = null,
) {
  const response = await post(
    request,
    `/api/presentations/${id}/files/uploads`,
    {
      kind: "pdf",
      name: "Slides.pdf",
      mime: "application/pdf",
      size: bytes.length,
      expectedFileId: expected,
    },
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    uploadId: string;
    uploadUrl: string;
    mime: string;
  };
}
async function transfer(
  request: APIRequestContext,
  upload: { uploadUrl: string; mime: string },
  bytes: Buffer,
) {
  const response = await request.put(upload.uploadUrl, {
    headers: {
      "Content-Type": upload.mime,
      apikey: localSupabase().PUBLISHABLE_KEY,
    },
    data: bytes,
  });
  expect(response.ok()).toBe(true);
}
test("private files enforce employee, owner, admin and deletion permissions at API and Storage boundaries", async ({
  page,
  account,
  archive,
  browser,
  request,
}) => {
  const owner = archive.presentation({ title: `${archive.tag} Private files` });
  const other = await createAccount();
  const context = await browser.newContext();
  const foreign = archive.presentation({
    title: `${archive.tag} Other files`,
    presenter: other.id,
  });
  const url = `/api/presentations/${owner.id}/files`;
  try {
    expect((await request.get(`${url}/pdf`)).status()).toBe(401);
    await signIn(page, account, `/presentations/${owner.id}`);
    expect(
      (
        await page.request.post(`${url}/uploads`, {
          headers: { Origin: "https://evil.test" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(
          page.request,
          `/api/presentations/${foreign.id}/files/uploads`,
          {},
        )
      ).status(),
    ).toBe(404);
    const bytes = pdfBytes(),
      upload = await prepare(page.request, owner.id, bytes);
    await transfer(page.request, upload, bytes);
    expect(
      (await post(page.request, `${url}/uploads/${upload.uploadId}`)).status(),
    ).toBe(200);
    const path = localSql(
      `select object_path from public.presentation_files where id='${upload.uploadId}'`,
    );
    for (const mode of ["public", "authenticated"])
      expect(
        (
          await request.get(
            `${localSupabase().API_URL}/storage/v1/object/${mode}/${slidesBucket}/${path}`,
          )
        ).ok(),
      ).toBe(false);
    const direct = createClient(
      localSupabase().API_URL,
      localSupabase().PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const signedIn = await direct.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    expect(Boolean(signedIn.error)).toBe(false);
    expect(
      Boolean((await direct.storage.from(slidesBucket).download(path)).error),
    ).toBe(true);
    expect(
      Boolean(
        (await direct.storage.from(slidesBucket).createSignedUrl(path, 60))
          .error,
      ),
    ).toBe(true);
    expect(
      Boolean(
        (
          await direct.rpc("complete_file_upload", {
            p_upload_id: upload.uploadId,
            p_auth_user_id: account.authId,
          })
        ).error,
      ),
    ).toBe(true);
    expect(
      Boolean(
        (
          await direct.storage.from(slidesBucket).upload(path, bytes, {
            contentType: "application/pdf",
            upsert: true,
          })
        ).error,
      ),
    ).toBe(true);
    const replay = await request.put(upload.uploadUrl, {
      headers: {
        "Content-Type": "application/pdf",
        apikey: localSupabase().PUBLISHABLE_KEY,
      },
      data: pdfBytes("Overwritten"),
    });
    expect(replay.ok()).toBe(false);
    expect(await (await page.request.get(`${url}/pdf`)).body()).toEqual(bytes);
    const reader = await context.newPage();
    await signIn(reader, other, `/presentations/${owner.id}`);
    await expect(
      reader.getByRole("heading", { name: "Manage slides" }),
    ).toHaveCount(0);
    expect((await reader.request.get(`${url}/pdf`)).status()).toBe(200);
    expect((await post(reader.request, `${url}/uploads`, {})).status()).toBe(
      404,
    );
    expect(
      (
        await post(reader.request, `${url}/uploads/${upload.uploadId}`)
      ).status(),
    ).toBe(404);
    localSql(`update public.users set role='admin' where id='${account.id}'`);
    await page.goto(`/presentations/${foreign.id}`);
    await expect(
      page.getByRole("heading", { name: "Manage slides" }),
    ).toBeVisible();
    const adminUpload = await prepare(page.request, foreign.id, bytes);
    await transfer(page.request, adminUpload, bytes);
    expect(
      (
        await post(
          page.request,
          `/api/presentations/${foreign.id}/files/uploads/${adminUpload.uploadId}`,
        )
      ).status(),
    ).toBe(200);
    localSql(
      `update public.presentations set deleted_at=now() where id='${owner.id}'`,
    );
    expect((await page.request.get(`${url}/pdf`)).status()).toBe(404);
    expect(
      (
        await reader.request.get(`${url}/pdf`, {
          headers: { Range: "bytes=0-7" },
        })
      ).status(),
    ).toBe(404);
    expect(
      Boolean(
        (await adminClient().storage.from(slidesBucket).info(path)).error,
      ),
    ).toBe(false);
    localSql(
      `update public.users set is_active=false where id='${account.id}'`,
    );
    expect(
      (
        await page.request.get(`/api/presentations/${foreign.id}/files/pdf`)
      ).ok(),
    ).toBe(false);
  } finally {
    await context.close();
    await cleanFiles(foreign.id);
    await removeAccount(other);
  }
});

test("racing replacements, byte-size mismatches, and revoked permissions preserve the current file", async ({
  page,
  account,
  archive,
}) => {
  const p = archive.presentation({ title: `${archive.tag} Competing files` });
  const base = `/api/presentations/${p.id}/files`;
  await signIn(page, account, `/presentations/${p.id}`);
  const bytes = pdfBytes();
  const first = await prepare(page.request, p.id, bytes),
    second = await prepare(page.request, p.id, bytes);
  await Promise.all([
    transfer(page.request, first, bytes),
    transfer(page.request, second, bytes),
  ]);
  const responses = await Promise.all([
    post(page.request, `${base}/uploads/${first.uploadId}`),
    post(page.request, `${base}/uploads/${second.uploadId}`),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  const current = localSql(
    `select id from public.presentation_files where presentation_id='${p.id}'`,
  );
  const mismatch = await prepare(page.request, p.id, bytes, current);
  await transfer(page.request, mismatch, pdfBytes("Different size"));
  expect(
    (await post(page.request, `${base}/uploads/${mismatch.uploadId}`)).status(),
  ).toBe(400);
  expect(
    localSql(
      `select id from public.presentation_files where presentation_id='${p.id}'`,
    ),
  ).toBe(current);
  const revoked = await prepare(page.request, p.id, bytes, current);
  await transfer(page.request, revoked, bytes);
  localSql(`update public.users set is_active=false where id='${account.id}'`);
  expect(
    (await post(page.request, `${base}/uploads/${revoked.uploadId}`)).ok(),
  ).toBe(false);
  expect(
    localSql(
      `select id from public.presentation_files where presentation_id='${p.id}'`,
    ),
  ).toBe(current);
});

test("50 MB uploads bypass the app request body, stream back intact, and oversized requests are rejected", async ({
  page,
  account,
  archive,
}) => {
  test.setTimeout(120000);
  const p = archive.presentation({ title: `${archive.tag} Maximum size` });
  await signIn(page, account, `/presentations/${p.id}`);
  const limit = 50 * 1024 * 1024;
  const original = pdfBytes();
  const bytes = Buffer.concat([
    original.subarray(0, -6),
    Buffer.alloc(limit - original.length, 0x20),
    original.subarray(-6),
  ]);
  const upload = await prepare(page.request, p.id, bytes);
  await transfer(page.request, upload, bytes);
  const base = `/api/presentations/${p.id}/files`;
  expect(
    (await post(page.request, `${base}/uploads/${upload.uploadId}`)).status(),
  ).toBe(200);
  const response = await page.request.get(`${base}/pdf`);
  expect(response.status()).toBe(200);
  // Buffer.equals compares the 50 MB payload without expanding millions of
  // indexed properties in the assertion library or a failure report.
  expect((await response.body()).equals(bytes)).toBe(true);
  const tooLarge = await post(page.request, `${base}/uploads`, {
    kind: "pdf",
    name: "Too large.pdf",
    mime: "application/pdf",
    size: limit + 1,
    expectedFileId: upload.uploadId,
  });
  expect(tooLarge.status()).toBe(400);
  const empty = await post(page.request, `${base}/uploads`, {
    kind: "pdf",
    name: "Empty.pdf",
    mime: "application/pdf",
    size: 0,
    expectedFileId: upload.uploadId,
  });
  expect(empty.status()).toBe(400);
});
