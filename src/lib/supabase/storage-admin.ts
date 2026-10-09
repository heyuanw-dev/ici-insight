import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "./config";
import type { Database } from "@/types/database";
import { slidesBucket } from "@/lib/files/config";

// Restricted to file orchestration. Never serialize this key/client to a page.
export function createStorageAdminClient() {
  const env = getSupabaseEnvironment();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!env || !key) throw new Error("Private file storage is not configured.");
  return createClient<Database>(env.url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

export async function fetchPrivateFile(
  objectPath: string,
  init: RequestInit = {},
) {
  const env = getSupabaseEnvironment();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!env || !key) throw new Error("Private file storage is not configured.");
  const path = objectPath.split("/").map(encodeURIComponent).join("/");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  return fetch(
    `${env.url}/storage/v1/object/authenticated/${slidesBucket}/${path}`,
    {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
    },
  );
}
