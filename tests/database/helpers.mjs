import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export async function database() {
  const db = new PGlite();
  // Only Supabase-managed identity infrastructure is stubbed; all application SQL is real.
  await db.exec(`
    create schema auth;
    create table auth.users (
      id uuid primary key, email text, encrypted_password text,
      invited_at timestamptz, raw_user_meta_data jsonb default '{}',
      email_confirmed_at timestamptz, banned_until timestamptz,
      deleted_at timestamptz, is_anonymous boolean default false
    );
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
      name text, metadata jsonb, unique(bucket_id,name)
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
  `);
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(name, directory), "utf8"));
  }
  return db;
}

export async function asEmployee(db, id, callback) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated");
  try {
    return await callback();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub");
  }
}
