import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  getSupabaseEnvironment,
} from "@/lib/supabase/config";
import type { Database } from "@/types/database";

export async function createSupabaseServerClient(writable = false) {
  const env = getSupabaseEnvironment();
  if (!env) throw new Error("Supabase authentication is not configured.");
  const store = await cookies();
  return createServerClient<Database>(env.url, env.publishableKey, {
    cookieOptions: authCookieOptions(env),
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        // Proxy refreshes sessions for read-only Server Components. Actions and
        // callbacks opt into cookie writes; they must never silently drop them.
        if (!writable) return;
        values.forEach(({ name, value, options }) =>
          store.set(name, value, options),
        );
      },
    },
  });
}

export async function clearAuthCookies() {
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (
      cookie.name === AUTH_COOKIE_NAME ||
      cookie.name.startsWith(`${AUTH_COOKIE_NAME}.`) ||
      cookie.name.startsWith(`${AUTH_COOKIE_NAME}-`)
    ) {
      store.delete(cookie.name);
    }
  }
}
