import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "@/lib/auth/redirects";
import { loadEmployee } from "@/lib/auth/session";
import { getSupabaseEnvironment } from "@/lib/supabase/config";
import {
  clearAuthCookies,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const env = getSupabaseEnvironment();
  let destination = "/login?notice=invalid-link";
  const code = request.nextUrl.searchParams.get("code");
  if (env && code && code.length <= 2048) {
    try {
      const client = await createSupabaseServerClient(true);
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        const employee = await loadEmployee(client, data.user);
        if (employee)
          destination = employee.password_setup_required
            ? "/account/password"
            : safeReturnPath(request.nextUrl.searchParams.get("next"));
        else {
          await client.auth.signOut({ scope: "local" });
          await clearAuthCookies();
        }
      }
    } catch {
      destination = "/login?notice=unavailable";
    }
  }
  const response = NextResponse.redirect(
    new URL(destination, env?.appUrl ?? request.nextUrl.origin),
    303,
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
