import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  authCookieOptions,
  getSupabaseEnvironment,
} from "@/lib/supabase/config";
import { safeReturnPath } from "@/lib/auth/redirects";
import type { Database } from "@/types/database";
import { pageContentSecurityPolicy } from "@/lib/security/headers";

export async function proxy(request: NextRequest) {
  const env = getSupabaseEnvironment();
  const api = request.nextUrl.pathname.startsWith("/api/");
  const requestHeaders = new Headers(request.headers);
  // Overwrite caller-supplied CSP/nonce headers. Next.js reads this trusted
  // request policy and automatically adds the nonce to its rendered scripts.
  const nonce = Buffer.from(
    crypto.getRandomValues(new Uint8Array(16)),
  ).toString("base64");
  const policy = pageContentSecurityPolicy({
    nonce,
    storageOrigin: env?.url,
    development: process.env.NODE_ENV === "development",
    https: env?.secureCookies,
  });
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const forward = () => {
    // Auth refresh changes request.cookies; forward those changes as well.
    requestHeaders.set("cookie", request.headers.get("cookie") ?? "");
    return NextResponse.next({ request: { headers: requestHeaders } });
  };
  const protect = (response: NextResponse) => {
    response.headers.set(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    if (env?.secureCookies)
      response.headers.set("Strict-Transport-Security", "max-age=31536000");
    if (!api) {
      response.headers.set("Content-Security-Policy", policy);
      response.headers.set("X-Frame-Options", "DENY");
    }
    // File endpoints retain their own SAMEORIGIN policy for native PDF viewing.
    return response;
  };
  let response = forward();
  let verified = false;

  if (env) {
    const client = createServerClient<Database>(env.url, env.publishableKey, {
      cookieOptions: authCookieOptions(env),
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values, headers) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = forward();
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        },
      },
    });
    try {
      const { data, error } = await client.auth.getClaims();
      verified = !error && Boolean(data?.claims.sub);
    } catch {
      // Fail closed for expired, malformed, or unverifiable credentials.
    }
  }

  const publicRoute = ["/login", "/auth/confirm", "/auth/callback"].includes(
    request.nextUrl.pathname,
  );
  if (!verified && !publicRoute) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      const denied = NextResponse.json(
        { error: "Sign in to access presentation files." },
        { status: 401 },
      );
      response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
      return protect(denied);
    }
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    destination.search = "";
    destination.searchParams.set(
      "next",
      safeReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`),
    );
    const redirected = NextResponse.redirect(
      destination,
      request.method === "GET" ? 307 : 303,
    );
    response.cookies
      .getAll()
      .forEach((cookie) => redirected.cookies.set(cookie));
    response = redirected;
  }

  // Refresh cookies and private pages must never enter a shared CDN/browser cache.
  return protect(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
