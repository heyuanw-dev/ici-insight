# ICI AI Insight Hub

Phase 1 foundation for ICI Lab’s internal weekly AI presentation platform. [REQUIREMENTS.md](./REQUIREMENTS.md) is the source of truth.

## Current scope

Implemented:

- Next.js App Router, strict TypeScript, Tailwind CSS, and reproducible npm dependencies.
- Responsive application shell, navigation, design tokens, shared UI components, and page metadata.
- Home, Schedule, and Archive shells; supporting presentation and account route placeholders.
- Keyboard focus and skip navigation, loading/error states, and a 404 page.
- PostgreSQL migration for users, categories, slots, presentations, and file metadata.
- A seed containing the 12 reference categories and six calendar months of Tuesday slots.
- Database integrity tests and browser checks across desktop, tablet, and mobile layouts.

This is a **local foundation preview**. Pages contain no employee or presentation records and never connect to Supabase. Sign-in, booking, editing, cancellation, live archive/search, file operations, and admin workflows are intentionally deferred. Placeholder routes do not submit forms or accept credentials. The workspace layout is a structural boundary, not an authentication guard.

Do not use this phase to host internal content. Application tables have Row Level Security enabled, no access policies, and no grants to anonymous or authenticated users. Phase 2 must add authentication, server authorization, and reviewed database policies before internal data is connected.

## Run locally

Use Node.js 22.13+ (22.x) or Node.js 24.x and npm. `.nvmrc` selects Node 22.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. The development server binds to `127.0.0.1` by default. No Docker, Supabase account, environment file, or credentials are needed to preview Phase 1.

If you use nvm, run `nvm use` first. If Node 22 is not installed, run `nvm install`.

Production build, still containing only the foundation preview:

```sh
npm run build
npm start
```

## Checks

```sh
npm run check
npx playwright install chromium
npm run test:ui
```

`check` runs ESLint, route-aware TypeScript checking, database tests, and the production build. Browser tests start and stop the production server on port 3100, so build before running them individually.

If Google Chrome is already installed, you can skip downloading Chromium and run:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:ui
```

Useful individual commands:

```sh
npm run lint
npm run typecheck
npm run test:db
npm run format:check
```

Database tests execute the actual migration and seed in an isolated, in-memory PostgreSQL instance using PGlite. Only Supabase’s managed `auth.users` table and the `anon`/`authenticated` roles are supplied as test fixtures. Tests cover slot uniqueness, same-day multiple slots, cancellation/soft deletion, failed moves, metadata constraints, Vancouver midnight and historical DST boundaries, seed preservation, identity retention, and default-deny access. PGlite uses a single connection; this does not test concurrent booking requests or a complete Supabase stack. Those integration tests belong with the later booking and authorization workflows.

Browser tests cover navigation, route shells, 404 handling, runtime errors, horizontal overflow, keyboard access, and automated WCAG checks. Screenshots and failure artifacts go into ignored `test-results/` directories. Automated accessibility checks do not replace manual review.

## Local database setup (optional in Phase 1)

Install and start Docker Desktop or another Supabase-compatible local container runtime. The Supabase CLI is included as a development dependency.

```sh
npm run db:start
npm run db:reset
```

`db:reset` rebuilds this project’s disposable **local** database and applies all migrations plus `supabase/seed.sql`; existing local database data is replaced. It does not target a hosted project. Supabase Studio is available at **http://127.0.0.1:54323**.

```sh
npm run db:types
npm run db:stop
```

`db:types` generates `src/types/database.ts` from the running local schema. The application does not need generated query types yet because Phase 1 performs no database queries. `src/types/domain.ts` contains only the application’s shared vocabulary.

No hosted database has been provisioned or migrated, and no storage buckets have been created. Supabase local configuration disables public and anonymous signups; hosted Auth configuration must be set independently during Phase 2. [Supabase migration workflow](https://supabase.com/docs/guides/local-development/database-migrations)

## Schema

| Entity                  | Purpose                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `users`                 | Stable application identity, optional unique Supabase Auth identity link, name, email, role, active state, audit timestamps |
| `categories`            | Editable category definitions, ordering, and active state                                                                   |
| `presentation_slots`    | Calendar date, slot number, open/closed state, audit timestamps                                                             |
| `presentations`         | Slot and presenter relationships, title, optional category/description/reference URL, cancellation/deletion timestamps      |
| `presentation_files`    | One current PowerPoint and PDF reference per presentation; bucket/path, filename, MIME type, size, uploader                 |
| `presentation_overview` | Non-deleted presentations joined to date, presenter, category, file IDs, and calculated status                              |

Key decisions:

- Unique `(presentation_date, slot_number)` allows several slots on one date. A partial unique index on `presentations.slot_id` excludes cancelled and soft-deleted records, preventing duplicate bookings without losing history.
- Presentation dates come from slots. Later rescheduling changes the presentation’s `slot_id`, not a shared slot’s calendar date. Booking transactions and permission checks are not implemented in Phase 1.
- `presentation_status` calculates completion at the following **America/Vancouver** midnight. A cancelled presentation stays cancelled. Soft-deleted rows are excluded from the overview; future archive queries must also filter for `completed`.
- Application user IDs survive removal of an authentication identity. Foreign keys prevent accidental destruction of authorship and file references.
- Descriptions allow up to 500 characters. Category, description, and one HTTP(S) reference URL are optional. Full URL validation will also be required at the server input boundary.
- Files are metadata only. Upload size limits, content validation, private buckets, signed URLs, and replacement cleanup belong to Phase 6.
- RLS is enabled with no policies; explicit grants are revoked. The view uses `security_invoker`, preserving underlying permissions. Ownership, same-day editing rules, and admin policies belong to Phase 2 and the later workflows.

The seed uses the current Vancouver date when it runs, includes Tuesdays in `[today, today + 6 calendar months)`, and creates one slot per Tuesday. Re-running it does not overwrite matching categories, occupied slots, or closures. It is initial reference data, not a scheduler or admin interface. There are no sample employees or presentations.

## Routes

| Route                      | Phase 1 behavior                                                     |
| -------------------------- | -------------------------------------------------------------------- |
| `/`                        | Home shell, purpose, navigation actions, and empty presentation area |
| `/schedule`                | Schedule shell without live dates or booking controls                |
| `/archive`                 | Archive shell without live search or filters                         |
| `/login`                   | Sign-in placeholder; no credentials collected                        |
| `/account/password`        | Account setup/recovery placeholder                                   |
| `/presentations/new`       | Registration placeholder                                             |
| `/presentations/[id]`      | Generic detail placeholder; no record lookup                         |
| `/presentations/[id]/edit` | Editing placeholder; no record lookup                                |

Authentication callbacks and file API endpoints will be added with their respective phases. Dynamic presentation routes currently accept any path identifier and show the same placeholder; validation, record lookup, access checks, and record-specific 404s are deferred.

## Design and structure

The design uses a restrained red, white, charcoal, and gray palette; semantic HTML; generous spacing; subtle borders; and visible focus states. Fonts use a local system stack without build-time font downloads. The ICI text identifier is an application wordmark, not a recreated Huawei logo. No official brand assets were supplied.

```text
src/
  app/
    (workspace)/          Home, schedule, archive, presentation route shells
    (auth)/               Login and password route shells
    layout.tsx            Shared shell, metadata, and main landmark
    globals.css           Tailwind theme and common visual tokens
    loading.tsx           Shared loading state
    error.tsx             Retryable error boundary
    not-found.tsx         Unknown-route page
  components/
    layout/               Header, footer, navigation, placeholder layout
    ui/                   Links styled as buttons, icons, headings, empty states
  lib/config.ts           Application name and confirmed requirements constants
  types/domain.ts         Shared domain vocabulary
supabase/
  config.toml             Local Supabase configuration
  migrations/            Versioned PostgreSQL schema
  seed.sql                Categories and initial weekly slots
tests/
  database/               Executable migration and integrity tests
  e2e/                    Browser, keyboard, and accessibility checks
```

Server Components are the default. Only active navigation and the error boundary need client-side JavaScript. Additional data-access modules should be added when they have a concrete use in a later phase.

## Environment variables

`.env.example` documents the planned configuration. Copy it to `.env.local` when configuring a later integration; it is not required for this phase.

| Variable                                       | Purpose                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `APP_URL`                                      | Application origin for future authentication redirects                 |
| `APP_TIMEZONE`                                 | Required deployment value: `America/Vancouver`                         |
| `NEXT_PUBLIC_SUPABASE_URL`                     | Supabase project URL                                                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`         | Publishable key; does not replace authorization policies               |
| `SUPABASE_SECRET_KEY`                          | Server-only privileged credential for narrowly scoped later operations |
| `SUPABASE_PPTX_BUCKET` / `SUPABASE_PDF_BUCKET` | Future private storage bucket names                                    |
| `MAX_UPLOAD_BYTES`                             | Future upload limit, initially `50000000`                              |
| `FILE_URL_TTL_SECONDS`                         | Future signed-link lifetime, initially `300`                           |

These are placeholders, not active integrations. The timezone is fixed to the confirmed requirement in `src/lib/config.ts` and the SQL migration; changing the environment variable alone does not change it. Never commit `.env.local`, database connection strings, or privileged keys.

## Remaining work and tooling notes

- Authentication and employee access are Phase 2. Provision the Supabase project, invite initial accounts, establish the first administrator, and configure authentication email delivery then.
- Full local Supabase validation requires a running container runtime. Embedded PostgreSQL tests cannot verify Supabase-managed services or network behavior.
- Official brand assets have not been supplied; the neutral application identity can be replaced later.
- Scheduling, rescheduling workflows, live archive/search, file handling, and administrative controls remain deferred as requested.
- The current Next.js ESLint configuration uses React plugins compatible with ESLint 9, so ESLint is pinned to 9.39.5. ESLint 10 currently fails with that plugin combination. Dependency audit also reports an upstream development-only `braces` advisory through the Next.js lint configuration; no fixed `braces` release was available when this foundation was checked. Production dependencies are checked separately with `npm audit --omit=dev`. Recheck these tooling dependencies before the next phase; do not use a forced audit downgrade of Next.js tooling.

Framework setup follows the official [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind CSS Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
