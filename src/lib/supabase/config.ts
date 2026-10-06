import "server-only";

export const AUTH_COOKIE_NAME = "ici-auth";

export type SupabaseEnvironment = {
  url: string;
  publishableKey: string;
  appUrl: string;
  secureCookies: boolean;
};

function validOrigin(value: string, allowPath: boolean): URL | null {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash) return null;
    if (!allowPath && url.pathname !== "/") return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
      return null;
    return url;
  } catch {
    return null;
  }
}

export function getSupabaseEnvironment(): SupabaseEnvironment | null {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const appUrl = process.env.APP_URL?.trim();
  if (!projectUrl || !key || !appUrl) return null;
  const project = validOrigin(projectUrl, false);
  const app = validOrigin(appUrl, false);
  if (!project || !app || key.startsWith("sb_secret_")) return null;

  // Local/older Supabase projects may use the legacy anon JWT instead.
  if (!key.startsWith("sb_publishable_")) {
    try {
      const payload: unknown = JSON.parse(
        Buffer.from(key.split(".")[1] ?? "", "base64url").toString(),
      );
      if (
        !payload ||
        typeof payload !== "object" ||
        !("role" in payload) ||
        payload.role !== "anon"
      )
        return null;
    } catch {
      return null;
    }
  }

  return {
    url: project.origin,
    publishableKey: key,
    appUrl: app.origin,
    secureCookies: app.protocol === "https:",
  };
}

export function authCookieOptions(env: SupabaseEnvironment) {
  return {
    name: AUTH_COOKIE_NAME,
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.secureCookies,
  };
}
