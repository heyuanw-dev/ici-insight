import assert from "node:assert/strict";
import { test } from "node:test";
import {
  safeReturnPath,
  isEmailToken,
  isUuid,
} from "../../src/lib/auth/redirects";
import {
  emailFrom,
  passwordFrom,
  passwordErrors,
} from "../../src/lib/auth/form-state";
test("return paths allow known internal pages and reject open redirects and auth loops", () => {
  for (const path of [
    "/schedule",
    "/archive?q=ai",
    "/account/password",
    "/presentations/11111111-1111-4111-8111-111111111111/edit",
  ])
    assert.equal(safeReturnPath(path), path);
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/%2f%2fevil.test",
    "/login?next=/login",
    "/auth/callback",
    "/admin",
    "/schedule\n",
    null,
    ["/schedule"],
  ])
    assert.equal(safeReturnPath(path), "/");
  assert.equal(safeReturnPath("/schedule#section"), "/schedule");
  assert.equal(isEmailToken("bad"), false);
  assert.equal(isUuid("example"), false);
});
test("email and password validation retains no passwords in errors", () => {
  const form = new FormData();
  form.set("email", " Employee@Example.test ");
  assert.equal(emailFrom(form), "employee@example.test");
  form.set("email", "not-an-email");
  assert.equal(emailFrom(form), null);
  form.set("password", "  correct horse  ");
  form.set("confirmPassword", "  correct horse  ");
  assert.equal(passwordFrom(form), "  correct horse  ");
  assert.equal(passwordErrors(form), undefined);
  form.set("confirmPassword", "different");
  assert.ok(passwordErrors(form)?.confirmPassword);
  form.set("password", "short");
  assert.ok(passwordErrors(form)?.password);
  form.set("password", "🔐".repeat(20));
  assert.ok(passwordErrors(form)?.password);
});
