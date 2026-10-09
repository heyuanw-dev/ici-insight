# ICI AI Insight Hub

Internal weekly AI presentation workspace for ICI Lab. [REQUIREMENTS.md](./REQUIREMENTS.md) is the source of truth. Phases 1–6 are implemented.

## Current scope

- Next.js App Router, strict TypeScript, Tailwind CSS, responsive navigation, shared visual components, and accessible page layouts.
- Invite-only email/password sign-in, invitation acceptance, password setup/recovery, and sign-out using Supabase Auth.
- Verified server sessions, active employee profiles, database-controlled user/admin roles, protected routes, and database read authorization.
- PostgreSQL schema for employees, categories, slots, presentations, and file metadata; six months of Tuesday slots and the 12 reference categories.
- Live upcoming presentations on Home, a schedule grouped by date and slot, 12-week navigation, and self-service registration with confirmation and conflict handling.

- Editing, rescheduling, and explicitly confirmed cancellation of your own upcoming presentations, including same-day changes. Moves preserve the original booking on failure; stale forms cannot overwrite newer changes. Cancelled records and files are retained.

- A live completed archive with partial-word search, presenter/category/year/date filters, pagination, file-availability indicators, and protected metadata detail pages.

- Private PowerPoint/PDF upload and replacement, including after completion, authenticated PowerPoint download, and browser PDF preview. Presenters manage their own slides; administrators manage any visible presentation's slides. Replacements preserve current files until validation and an atomic save succeed.

Administrative historical corrections, schedule management, and soft deletion remain Phase 7. Business changes use restricted database functions; direct table writes remain denied to employees, including application administrators. See [Phase 6 implementation and Success Criteria](./docs/phase-6.md).

## Run locally

Use Node.js 22.13+ (22.x) or Node.js 24.x, npm, and a running Docker Desktop or compatible container runtime. `.nvmrc` selects Node 22.

```sh
npm ci
npm run db:start
cp .env.example .env.local
```

For a fresh checkout, set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` to the **local publishable key** shown by `db:start` or `npx supabase status`. Set `SUPABASE_SERVICE_ROLE_KEY` to the **local service-role key** for server-only file validation, publication, and streaming. Never put the privileged key in a `NEXT_PUBLIC_` variable. Keep the other example values for the default local setup. Preserve an existing `.env.local` instead of copying over it.

```sh
npm run dev
```

Open **http://localhost:3000**. The server binds to `127.0.0.1`. The login page displays a configuration-unavailable message if required environment values are absent or invalid; internal routes remain protected. Restart Next.js after changing environment variables. Rebuild production output when changing either `NEXT_PUBLIC_` value.

For an existing local database, apply pending migrations before running the app:

```sh
npx supabase migration up --local
```

For a disposable local database only, `npm run db:reset` rebuilds this project's database and seeds it, **replacing existing local data**. Stop containers with `npm run db:stop`; this preserves local data. No hosted project is changed by these commands.

### Invite your first employee and administrator

1. Open local Supabase Studio at **http://127.0.0.1:54323**. In Authentication → Users, choose **Invite user** and enter the employee's email.
2. Open the captured invitation in local Mailpit at **http://127.0.0.1:54324**. Local mail stays in Mailpit; it is not delivered to an external mailbox.
3. Follow the invitation, select **Continue to password setup**, and choose a password. Then sign in with that email and password.
4. To establish an administrator, change that employee's `public.users.role` from `user` to `admin` in Studio, or run the following in Studio's SQL editor with the intended employee's email:

```sql
update public.users
set role = 'admin'
where lower(email) = lower('employee@example.com');
```

Invitations automatically create a linked employee profile with the regular `user` role. A new invitation requires a password change after email confirmation before workspace access. Roles and active state never come from editable Auth user metadata. Set `public.users.is_active = false` to revoke application access immediately, including reads using an existing access token. Re-enable explicitly when appropriate. Supabase Auth bans are also respected.

Prefer **Invite user** over **Create user**. A manually created Auth identity alone has no application access; an administrator must explicitly create its linked `public.users` profile. If you choose that provisioning route, confirm the Auth email and insert the exact Auth UUID, employee name, and email. Set `password_setup_required = false` only if a password was already deliberately provisioned. Never infer an admin role from email or user metadata.

Deleting an Auth identity retains the application profile and authorship. Re-inviting the same email will conflict with its retained unique email until an administrator deliberately reconciles that profile. Do not delete historical profiles or automatically reconnect a new identity to a previous administrator.

### Hosted Supabase / Vercel setup

No hosted project has been configured or deployed. Before using a hosted environment:

- Apply the repository migrations through the normal Supabase migration workflow.
- Enable the email/password provider; disable public signups and anonymous sign-ins. Set the minimum password length to at least 8 characters.
- Set the Supabase Auth **Site URL** and Vercel `APP_URL` to the same canonical HTTPS origin. Allow that origin's `/auth/callback` redirect. Use a separate Supabase project for preview environments if they need authentication.
- Copy [invite.html](./supabase/templates/invite.html) and [recovery.html](./supabase/templates/recovery.html) into the corresponding Supabase Auth email templates. These use `SiteURL` and a one-time token hash to open `/auth/confirm`; merely loading the page does not consume the token.
- Configure authentication email delivery/SMTP and verify delivery, expiration, and redirects with the deployed origin. Invite initial employees and establish the first administrator in Supabase administration.
- Set the four environment variables from `.env.example` in Vercel, including the server-only `SUPABASE_SERVICE_ROLE_KEY`, before building. Apply the Phase 6 migration to create the private `presentation-slides` bucket; keep it private and do not add client read/write policies.
- Confirm Supabase's project-wide Storage size limit permits the bucket's configured 50 MB limit. File transfers go directly to Storage; the app validates and saves them afterward. Verify a maximum-size upload and PDF preview on the hosted origin.

`supabase/config.toml` configures **local** services only. In particular, `[auth].enable_signup = false` blocks public registration, while `[auth.email].enable_signup = true` keeps the email provider available for invited users' sign-in and recovery. The browser tests also verify that direct public signup is rejected. See the [Supabase provider configuration clarification](https://github.com/supabase/supabase/issues/40582) and [Auth configuration documentation](https://supabase.com/docs/guides/auth/general-configuration).

## Authentication and authorization

Authentication and metadata calls run on the server using the publishable key and the employee's session. There is no browser Auth client or local-storage session token. Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS. The Next.js proxy refreshes and verifies tokens, while server guards use `getUser()` and the current application profile to verify employee membership and role. Private responses use `Cache-Control: private, no-store`. Return destinations are restricted to known internal routes. Credential mutations use POST Server Actions and Next.js origin checks.

File orchestration additionally uses a server-only service-role client after employee/permission checks. The browser receives an upload-only token for one immutable object; it never receives a privileged key or a signed read URL. Upload routes enforce the configured `APP_URL` origin. Downloads and PDF byte-range requests pass through authenticated application endpoints, rechecking active membership and non-deleted presentation visibility each time. No client Storage policies are granted. Publication rechecks the uploader's account and ownership/admin role in SQL.

The database independently resolves an active, confirmed, unbanned employee from `auth.uid()`. Completed password setup is required for domain reads. Anonymous and unlinked identities cannot read internal data. Employees can read their own access-status profile before password setup; active employees can read the internal directory and visible domain records. Soft-deleted presentations and their file metadata are hidden, including through the security-invoker overview view.

`presentation_permissions` is a read-only RPC used by server route guards. Owners may edit metadata through the scheduled Vancouver date; completed metadata requires an administrator. File-management permission remains available to owners after completion. Administrators may manage any visible presentation. The upcoming workflow uses `register_presentation`, `update_presentation`, and `cancel_presentation` RPCs. File preparation uses `prepare_file_upload`; only the server can call `complete_file_upload` after content validation. Historical administrative metadata mutations remain Phase 7. Direct updates to roles, active state, password-setup flags, or business records remain denied to both application roles.

Sign-out clears this browser's credentials and revokes its refresh token. A password update requests global refresh-token revocation and requires another sign-in. Supabase access tokens already issued to other clients can remain valid until expiry; account deactivation/ban is checked independently on protected reads. If Auth is unavailable during sign-out, the browser cookies are still removed, but server-side revocation cannot be guaranteed.

## Routes

| Route                                              | Current behavior                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/login`                                           | Public invited-account sign-in; `?mode=recovery` displays password recovery          |
| `/auth/confirm`                                    | Public confirmation screen for invitation/recovery links; token consumed on POST     |
| `/auth/callback`                                   | Public PKCE session exchange; validates account and safe return destination          |
| `/account/password`                                | Verified active account required; supports initial setup and password changes        |
| `/`                                                | Live next presentation, upcoming topics, and next available slots                    |
| `/schedule`                                        | Available, booked, and closed slots; 12-week navigation                              |
| `/archive`                                         | Completed presentations; search, filters, and pagination                             |
| `/presentations/new`                               | Slot selection guidance; `?slot=UUID` opens registration                             |
| `/presentations/[id]`                              | Protected details, PowerPoint download, PDF preview, and authorized slide management |
| `/presentations/[id]/edit`                         | Owner/date/admin authorization; upcoming edits, rescheduling, and cancellation       |
| `/api/presentations/[id]/files/uploads`            | POST: authorize and prepare an upload-only Storage URL                               |
| `/api/presentations/[id]/files/uploads/[uploadId]` | POST: validate stored bytes and publish atomically                                   |
| `/api/presentations/[id]/files/[kind]`             | GET/HEAD: authenticated PowerPoint attachment or inline PDF, including byte ranges   |

The confirmation/callback endpoints only establish authentication; they expose no internal content. Invalid, missing, unauthorized, and soft-deleted presentation IDs share the same not-found screen.

## Database and structure

| Entity                      | Purpose                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `users`                     | Stable employee identity, optional Auth link, name/email, protected role/active state, password setup state           |
| `categories`                | Category names, ordering, active state                                                                                |
| `presentation_slots`        | Date, slot number, open/closed state; multiple slots per day                                                          |
| `presentations`             | One presenter/slot, required title, optional category/description/reference URL, cancellation/soft deletion, revision |
| `presentation_files`        | One current PPTX/PDF reference per presentation; file metadata only                                                   |
| `presentation_file_uploads` | Private upload intents, expected current file IDs, expiry, and publication/failure state                              |
| `schedule_slots`            | Available/closed slots and current bookings; underlying RLS is preserved                                              |
| `presentation_overview`     | Visible presentations with calculated status, presenter, category, and file IDs                                       |

The archive derives completion from Vancouver midnight on each database read. `archive_presentations` is a security-invoker view of completed metadata; `search_archive` and `archive_filter_options` are read-only functions that preserve employee RLS. Search matches all entered words as case-insensitive literal substrings across title, presenter, description, and category. Filters combine, date bounds are inclusive, and pages contain up to 12 results. Search state stays in the URL for reloads, history, and detail-page return links. No search service, status job, or manual archive action is needed.

A partial unique index prevents duplicate active bookings while cancellation/soft deletion releases the slot. Completion uses the following **America/Vancouver** midnight. The seed creates Tuesdays in `[today, today + 6 calendar months)` and preserves matching categories, slots, and closures when rerun. No sample employees or presentations are seeded.

File binaries live in the private `presentation-slides` Storage bucket. Uploads validate extension, MIME, size, and content before attachment. The 50 MB default is configured on the bucket; application forms and server validation read that limit. PPTX inspection uses a small ZIP reader (`yauzl`) with bounded XML decompression. PDF validation checks its signature and EOF marker. No automatic conversion occurs. Superseded and abandoned objects stay inaccessible and retained pending a future retention policy; rejected content is removed best-effort. See [file lifecycle and configuration](./docs/phase-6.md).

```text
src/
  app/
    (auth)/                Login, password, confirmation UI, Auth Server Actions
    auth/callback/         PKCE callback handler
    api/presentations/     File upload preparation/completion and private streaming
    (workspace)/           Protected Home, schedule, registration/editing, archive, and details
    layout.tsx             Shared header, footer, metadata, main landmark
    globals.css            Tailwind theme and visual tokens
  components/
    archive/               Search filters, archive cards, file-availability indicators
    auth/                  Accessible authentication forms
    files/                 Slide management, progress, download links, PDF preview
    layout/                Header, navigation, footer, placeholder layout
    schedule/              Slot cards, shared metadata fields, registration and editing forms
    ui/                    Buttons, icons, headings, empty states
  lib/
    archive/               Validated archive queries and protected detail reads
    auth/                  Verified sessions, route guards, input/redirect validation
    files/                 File configuration, validation, metadata reads, API guards
    supabase/              Server client and validated environment configuration
    schedule/              Calendar dates, authorized reads, registration/edit validation
    config.ts              Application name and confirmed constants
  proxy.ts                 Session refresh, initial route guard, cache headers
  types/                   Generated database types and domain vocabulary
supabase/
  migrations/              Foundation, authorization, booking/edit/cancel SQL, and read-only archive queries
  templates/               Invitation and recovery email templates
  config.toml              Local service/Auth configuration
  seed.sql                 Categories and initial weekly slots
tests/
  database/                Executable PostgreSQL integrity and authorization tests
  unit/                    Input validation and return-path tests
  e2e/                     Browser, real local Auth/API, and accessibility tests
```

Run `npm run db:types` against the running local database after a schema change, then format the generated file. Environment variables are `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Timezone is fixed in application constants and SQL. Never commit `.env.local`.

## Checks

```sh
npm run check
npm run format:check
npx playwright install chromium
npm run test:ui
```

`check` runs lint, route-aware TypeScript checking, unit tests, PostgreSQL schema/RLS tests, and a production build. Unit and database tests do not require Docker. Browser tests require this project's running **local** Supabase stack, `.env.local` pointing to it (including its service-role key), and a fresh production build. They start the application on port 3100, create temporary `.test` accounts, exercise real local Auth/PostgREST/Mailpit/Storage services, and remove their own records and file objects. No real employee mail is sent. Tests refuse non-local database targets.

If Google Chrome is installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:ui` instead of downloading Chromium. UI checks run at desktop, tablet, and mobile widths. The shared authorization and concurrent-mutation integration scenarios run once on desktop. Booking tests use separate database connections and deliberately held row locks to verify competing bookings and moves, edit/cancel conflicts, simultaneous closures, and access revocation during a wait. Screenshots/traces are ignored local test artifacts and can contain test credentials; do not publish them. Automated accessibility checks supplement manual review.

For a production-style local run:

```sh
npm run build
npm start
```

## Remaining work

- Hosted Supabase/Vercel configuration, SMTP delivery, actual employee invitations, and initial administrator provisioning require the real project and domain.
- Phase 7 administrative workflows remain unimplemented. Phase 8 remains the final cross-application refinement/review phase. The complete Success Criteria status is in [docs/phase-6.md](./docs/phase-6.md).
- The Phase 1 tooling limitation remains: Next.js's React lint plugins require the pinned ESLint 9 version. The dependency audit reports an upstream development-only `braces` advisory through that lint configuration; production dependencies are audited separately with `npm audit --omit=dev`. Avoid a forced tooling downgrade.

Auth integration follows the official [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication).
