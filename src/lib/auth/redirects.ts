import type { Route } from "next";
export function safeReturnPath(value: unknown): Route {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid") return "/";
    const allowed =
      [
        "/",
        "/schedule",
        "/archive",
        "/account/password",
        "/presentations/new",
      ].includes(url.pathname) ||
      /^\/presentations\/[a-f0-9-]{36}(\/edit)?$/i.test(url.pathname);
    return allowed ? (`${url.pathname}${url.search}` as Route) : "/";
  } catch {
    return "/";
  }
}

export function isEmailToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{20,512}$/.test(value);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
