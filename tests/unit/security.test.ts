import assert from "node:assert/strict";
import test from "node:test";
import { pageContentSecurityPolicy } from "../../src/lib/security/headers";
import {
  readSmallJson,
  RequestBodyError,
} from "../../src/lib/security/request-body";

const jsonRequest = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://app.example.test/upload", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", ...headers },
  });
const rejected = (status: number) => (error: unknown) =>
  error instanceof RequestBodyError && error.status === status;

test("production CSP uses a nonce, blocks executable attributes and embedding, and limits Storage connections", () => {
  const policy = pageContentSecurityPolicy({
    nonce: "test-nonce",
    storageOrigin: "https://example.supabase.co",
    https: true,
  });
  assert.match(
    policy,
    /script-src 'self' 'nonce-test-nonce' 'strict-dynamic';/,
  );
  assert.match(policy, /script-src-attr 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /form-action 'self'/);
  assert.match(policy, /connect-src 'self' https:\/\/example.supabase.co;/);
  assert.match(policy, /upgrade-insecure-requests/);
  assert.doesNotMatch(policy, /unsafe-eval|connect-src[^;]*\*/);
});

test("local development permits hot reload without upgrading loopback HTTP", () => {
  const policy = pageContentSecurityPolicy({
    nonce: "nonce",
    development: true,
  });
  assert.match(policy, /'unsafe-eval'/);
  assert.match(policy, /connect-src 'self' ws: wss:/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});

test("small JSON accepts UTF-8 and an exact byte limit, rejects invalid JSON and media types", async () => {
  const body = JSON.stringify({ name: "示例.pdf" });
  assert.deepEqual(
    await readSmallJson(jsonRequest(body), Buffer.byteLength(body)),
    { name: "示例.pdf" },
  );
  await assert.rejects(
    readSmallJson(jsonRequest(body), Buffer.byteLength(body) - 1),
    rejected(413),
  );
  assert.deepEqual(
    await readSmallJson(
      jsonRequest("{}", { "Content-Type": "Application/JSON; charset=utf-8" }),
    ),
    {},
  );
  await assert.rejects(readSmallJson(jsonRequest("{")), rejected(400));
  await assert.rejects(
    readSmallJson(jsonRequest("{}", { "Content-Type": "text/plain" })),
    rejected(415),
  );
  await assert.rejects(
    readSmallJson(
      new Request("https://app.example.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    ),
    rejected(400),
  );
});

test("oversized declarations are cancelled before reading", async () => {
  for (const length of ["4097", "-1", "not-a-length"]) {
    let cancelled = false;
    const request = new Request("https://app.example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": length },
      body: new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      duplex: "half",
    } as RequestInit);
    await assert.rejects(readSmallJson(request), rejected(413));
    assert.equal(cancelled, true);
  }
});

test("chunked bodies stop and cancel at the byte limit even with a misleading length", async () => {
  for (const declared of [undefined, "2"]) {
    let cancelled = false;
    let reads = 0;
    const headers = new Headers({ "Content-Type": "application/json" });
    if (declared) headers.set("Content-Length", declared);
    const request = new Request("https://app.example.test", {
      method: "POST",
      headers,
      body: new ReadableStream({
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(2048));
        },
        cancel() {
          cancelled = true;
        },
      }),
      duplex: "half",
    } as RequestInit);
    await assert.rejects(readSmallJson(request), rejected(413));
    assert.equal(cancelled, true);
    assert.ok(reads <= 4, "must not buffer the remaining request");
  }
});
