import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  authCookieOptions,
  getSupabaseEnvironment,
} from "@/lib/supabase/config";
import { safeReturnPath } from "@/lib/auth/redirects";
import type { Database } from "@/types/database";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getSupabaseEnvironment();
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
          response = NextResponse.next({ request });
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
  response.headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
