# Auth user synchronization

The original `private.sync_invited_employee()` trigger inserted application profiles only when `auth.users.invited_at` was present. Dashboard **Create user** creates a non-invited identity, so that trigger could update an existing profile but never create a missing one. The original profile primary key also defaulted to a separate random UUID.

## Migration and account behavior

Apply [20261013000000_auth_user_synchronization.sql](../supabase/migrations/20261013000000_auth_user_synchronization.sql) after the earlier repository migrations. It runs in one transaction:

1. Lock identity/profile writes and check for conflicting UUIDs or case-insensitive trimmed emails. Abort on ambiguity; never link identities or transfer privileges using email alone.
2. Change the presenter and file-uploader foreign keys to `ON UPDATE CASCADE`, retaining their existing `ON DELETE RESTRICT` behavior. Align each linked legacy profile's `id` with its `auth_user_id`. Presentation IDs, file IDs, paths, and stored objects remain unchanged, including cancelled/deleted history.
3. Enforce `id = auth_user_id` for linked profiles. Unlinked retained profiles are still allowed; Auth deletion still clears `auth_user_id` without deleting authorship.
4. Replace the invitation-only trigger with `private.sync_auth_employee()`. On Auth insertion, or updates to email/password/invitation status, upsert the profile using the Auth UUID. Concurrent/repeated synchronization is protected by the existing unique constraints.
5. Backfill missing non-anonymous, non-deleted email accounts. Leave existing names, roles, active status, password-setup flags, and creation timestamps intact. Linked IDs, update timestamps, and presentation revision counters can change during alignment.

New profile names use the first nonblank string from metadata `name`, then `full_name`, then the email local part. New roles use the schema default `user`; metadata cannot assign administrator access or active/setup flags. Later Auth changes synchronize the email and clear password setup only after a real password change on an already-confirmed identity. Existing display names and roles are not overwritten.

All new and backfilled profiles require website password setup, matching the existing schema default. Supabase can generate an internal random password hash for invitations and for manual creation without a supplied password; hash presence alone cannot prove setup. A confirmed manually created account with a known password can sign in, then is directed to `/account/password`. Accounts without a known password use the website's password recovery flow. A subsequent password change after email confirmation completes setup. Existing profile setup flags are preserved. Email confirmation, active status, bans, and all authorization checks still apply.

The trigger uses `SECURITY DEFINER`, an empty search path, qualified table references, and revoked client execution. RLS policies and application table-write grants are unchanged. The server still looks up profiles by `auth_user_id` in `src/lib/auth/session.ts`. Passwords and hashes stay in `auth.users`; the trigger only checks whether a hash exists or changed. No password column is added to `public.users`.

## Applying the change

For the existing local stack, with Docker/Supabase running:

```sh
npx supabase migration up --local
```

For a hosted project, use its normal migration process. With the CLI authenticated and linked to the intended project:

```sh
npx supabase db push --dry-run
npx supabase db push
```

Review the dry run for all pending migrations. Keep a database backup before aligning production IDs and apply during a quiet period. Table locks briefly block writes (and some reads during constraint changes). A five-second lock timeout aborts the transaction if locks cannot be obtained; retry after competing transactions finish. Application user IDs change for legacy linked profiles, so refresh open forms and update saved archive presenter filters. External references to old profile UUIDs, if any exist outside this repository's schema, need separate updating. Presentation/file URLs remain valid.

No new environment variables, application service, scheduled job, or manual profile inserts are needed. In hosted Supabase, keep public signup and anonymous sign-in disabled. With automatic provisioning, enabling public signup would also allow those email accounts to receive employee profiles. Assign initial administrator roles explicitly in `public.users` as described in the README.

## Conflict checks

The migration reports `auth_sync_email_conflict` or `auth_sync_identity_conflict` and rolls back rather than modifying ambiguous accounts. A common email conflict is an application profile retained after an earlier Auth identity was deleted. Do not delete historical records or automatically reconnect a new account to a retained administrator profile.

Use the SQL editor as a database administrator to inspect conflicts:

```sql
-- Email attached to a different identity, or an unlinked retained profile.
select a.id as auth_id, u.id as profile_id, u.auth_user_id, u.email
from auth.users a
join public.users u on lower(btrim(u.email)) = lower(btrim(a.email))
where a.is_anonymous is not true and a.deleted_at is null
  and nullif(btrim(a.email), '') is not null
  and u.auth_user_id is distinct from a.id;

-- Multiple eligible Auth identities sharing an application-normalized email.
select lower(btrim(email)) as email, array_agg(id) as auth_ids
from auth.users
where is_anonymous is not true and deleted_at is null
  and nullif(btrim(email), '') is not null
group by lower(btrim(email)) having count(*) > 1;

-- A legacy linked profile's target UUID is occupied by another profile.
select u.id as legacy_id, u.auth_user_id as target_id, other.auth_user_id
from public.users u
join public.users other on other.id = u.auth_user_id and other.id <> u.id;

-- An Auth UUID is occupied by a profile that is not linked to that identity.
select a.id as auth_id, u.id as profile_id, u.auth_user_id
from auth.users a join public.users u on u.id = a.id
where a.is_anonymous is not true and a.deleted_at is null
  and nullif(btrim(a.email), '') is not null
  and u.auth_user_id is distinct from a.id;
```

Resolve each conflict only after verifying identity, ownership, and the intended role, then rerun the migration. Subsequent new Auth accounts that conflict with retained emails also fail atomically; the trigger cannot silently take over a profile. Any future failing profile trigger can block the corresponding Auth operation, so check Supabase database/Auth logs when account creation fails.

## Verification

`tests/database/auth-synchronization.test.mjs` covers new manual accounts, name fallbacks, shared UUIDs, protected privilege fields, passwordless setup, duplicate prevention, retained accounts, all three cascading ownership references, legacy administrator preservation, and atomic migration failure. The existing schema/authentication/RLS, scheduling, editing, archive, file, and administrative suites run against the new migration and create fixtures through the trigger.

`tests/e2e/auth-synchronization-integration.spec.ts` uses the real local Supabase Auth admin API to create email accounts with and without passwords, checks the generated profiles, signs into the website, verifies email synchronization and administrator preservation, and completes website password setup. The existing invitation/recovery integration tests protect those flows. The admin client is used only in test setup; no privileged key is sent to the browser.

```sh
npm run check
npm run format:check
PLAYWRIGHT_CHANNEL=chrome npm run test:ui
```

After applying the migration, these queries should both return zero:

```sql
select count(*) as missing_profiles
from auth.users a
where a.is_anonymous is not true and a.deleted_at is null
  and nullif(btrim(a.email), '') is not null
  and not exists (select 1 from public.users u where u.auth_user_id = a.id);

select count(*) as mismatched_ids
from public.users where auth_user_id is not null and id <> auth_user_id;
```

Create a disposable email account in **Authentication → Users → Create user**, confirm that both profile UUIDs match its Auth UUID and role is `user`, and sign in once the email is confirmed, then complete the website's initial password setup. Separately invite a disposable employee and complete the existing password-setup flow. Hosted SMTP, URL/template settings, and the hosted migration still require configuration in the real project; local tests do not verify them.
