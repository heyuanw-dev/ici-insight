# Phase 7 — Administrative workflows

Scope follows `REQUIREMENTS.md` Sections 3, 5–8, 15, 18, and 20. This phase adds schedule management, historical metadata corrections, administrative cancellation, and soft deletion. Phase 8's final cross-application review remains separate.

## Workflows

- **Schedule → Manage schedule** is available only to administrators. `/schedule/manage` displays 12 weeks from a selectable date, including past dates, with existing bookings linked to their editors. Retained cancellations in that range are also listed so an administrator can find, correct, or delete them.
- Add a slot on any date. A blank slot number selects the next number on that date; an explicit number must be between 1 and 32767 and unique on the date. Multiple presentations remain separate slots, each with one presenter.
- Extend the weekly schedule across an inclusive date range. The form defaults to approximately six months after the latest slot; a request may span up to 366 days from a current/future start. Two slots are added on Tuesday in each Monday–Sunday week with no existing slots (updated by the weekly scheduling migration). Weeks moved to another day are preserved. Repeating an extension adds no duplicates and never changes existing slots, bookings, or closures.
- Close an individual slot or a whole date. Closing a booked slot/date is rejected until every affected presentation is explicitly rescheduled or cancelled. No booking is silently moved or cancelled. A holiday can be closed before any slots exist; that closure also applies to slots added later. Reopening a date preserves each slot's individual open/closed setting. Past dates remain unavailable to regular users regardless of their open setting.
- Change the date, number, or open setting of an unused slot. A slot referenced by any presentation—including retained cancelled/deleted records—keeps its date and number, preserving that record's history. To move a presentation, create/select its destination slot and reschedule from the presentation editor.
- **Presentation → Edit presentation** gives admins a separate editor for any visible record, including completed and cancelled presentations. It supports title, optional category, 500-character description, reference URL, presenter, and historical/current/future slot corrections. Former employee profiles and inactive categories can be selected for historical accuracy. These choices do not reactivate accounts or categories.
- Moving a non-cancelled presentation requires an open, unoccupied destination and reserves it atomically. Its status follows the corrected date in America/Vancouver. Keeping its current slot allows metadata correction even when that slot is closed. A cancelled record remains cancelled when edited and does not reserve a slot; there is no restore/uncancel workflow.
- Admins can explicitly confirm cancellation of any non-deleted presentation, including completed records. Cancellation retains a visible record and files, frees its booking, and excludes it from the completed archive.
- Admins can explicitly confirm **Delete presentation** for any visible record. This sets `deleted_at`; the record and all current file references, upload intents, and Storage objects remain retained. Normal pages, search, preview, downloads, and file publication no longer expose the record, including to admins. Deletion does not reopen closed or past slots. There is no permanent deletion or restoration UI.

Forms expose pending, validation, conflict, success, and error states. Slot and presentation revisions reject stale edits, cancellation, and deletion. Failed forms retain drafts and link to the latest version. Date closure changes check their expected previous state. All mutations recheck authorization in PostgreSQL; hiding a control is not the authorization boundary.

## Weekly scheduling follow-up

`20261012000000_weekly_schedule.sql` updates the default to two slots per week and adds **Change presentation day**. This administrator-only action moves all slots and active presentations on a date to an empty current/future date in the same Monday–Sunday week. It requires confirmation, rejects closed dates and stale slot/booking snapshots, and uses the existing schedule lock and ordered row locks. Presentation IDs and files are retained, while presentation revisions advance to invalidate older editors. Cancelled/deleted records stay on their original slots, which remain closed; empty original slots are removed. Date closures are not moved or reopened.

The migration adds a second slot to existing upcoming weeks containing exactly one slot, preserving that slot’s closed state. The seed and extension share a private generator that creates two Tuesday slots only in empty weeks. Repeating either preserves moved days, extra slots, existing bookings, and closures. No new tables, dependencies, environment variables, or Storage policies are introduced. The local migration command below applies this update as well.

Follow-up tests cover the single-slot migration, two-slot seeding/extension, moved weeks surviving repeat generation, preservation of files and cancelled/deleted history, stale editors and confirmations, closed/conflicting destinations, and administrator authorization. Browser tests exercise both orders of a concurrent day move and booking, role revocation during a lock wait, accessible error focus, and the complete administration flow on desktop, tablet, and mobile.

## Migration and concurrency

`supabase/migrations/20261008000000_administration.sql` adds:

- `schedule_date_closures`, an RLS-protected date-level closure table readable by active employees, with no direct client writes.
- `presentation_slots.revision` and an update trigger for stale-slot protection. Existing slots start at revision 1.
- Effective availability in the existing security-invoker `schedule_slots` view, combining per-slot settings with date closures.
- Six administrator-only mutation RPCs: `admin_create_slot`, `admin_extend_schedule`, `admin_update_slot`, `admin_set_date_closed`, `admin_update_presentation`, and `admin_remove_presentation`.
- Closure enforcement in ordinary registration/rescheduling, without expanding regular users' historical permissions. The existing owner workflow RPCs stay constrained to upcoming presentations; historical admin actions use the new RPCs.

For this 30–50 person application, a single transaction-scoped advisory lock orders application scheduling mutations. It is acquired before category, slot, and presentation row locks. This also serializes date closures with new slots/extensions and bookings, including dates that initially have no rows to lock. The unique active-booking index and ordered row locks remain in place. Role/access checks run again after row-lock waits; regular-user date checks still use the Vancouver wall clock after waiting. File transactions continue to lock only their presentation and independently recheck visibility and ownership.

The migration preserves existing presentations, slot settings, and files. It was applied to the existing local database without resetting or reseeding. Generated TypeScript database types were updated. To apply it to another local checkout:

```sh
npx supabase migration up --local
```

Apply pending migrations to hosted Supabase before deploying the new app. No hosted migration or deployment was performed.

## Configuration and local run

No new environment variables, dependencies, scheduled jobs, or Storage policies are required. Preserve the four Phase 6 variables in `.env.local`: `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`.

With Node 22.13+ (22.x) or 24.x and Docker running:

```sh
npm ci
npm run db:start
npx supabase migration up --local
npm run dev
```

Open **http://localhost:3000**. For a fresh checkout, copy `.env.example` to `.env.local` and supply the local Supabase publishable and service-role keys before starting Next.js. Do not overwrite an existing `.env.local`.

Invite employees and establish the initial administrator in Supabase administration, as described in the [README](../README.md#invite-your-first-employee-and-administrator). Set the intended account's `public.users.role` to `admin`; email invitation metadata cannot grant that role. Accounts must finish password setup. Local Studio is **http://127.0.0.1:54323** and captured invitation mail is **http://127.0.0.1:54324**. Then sign in and use **Schedule → Manage schedule**.

Hosted setup still requires the existing Vercel/Supabase environment, Auth origins, email templates/SMTP, employee invitations, and administrator provisioning. Configure actual holiday dates through the new admin page; no company holiday calendar is assumed. Files remain private under the existing Phase 6 policies.

## Files changed

| Files                                                                                                  | Purpose                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/app/(workspace)/schedule/manage/{page.tsx,actions.ts}`                                            | Protected schedule administration and validated Server Actions.                                        |
| `src/app/(workspace)/schedule/page.tsx`, `src/lib/schedule/data.ts`, `src/lib/auth/redirects.ts`       | Admin entry point and safe authenticated return route.                                                 |
| `src/app/(workspace)/presentations/[id]/edit/{page.tsx,admin-actions.ts}`                              | Admin editor selection, historical corrections, confirmed cancellation/deletion.                       |
| `src/app/(workspace)/presentations/[id]/page.tsx`, `src/lib/archive/data.ts`                           | Historical admin edit link and result messages.                                                        |
| `src/components/admin/*`, `src/lib/admin/*`                                                            | Reusable admin forms, protected reads, validation, and human-readable errors.                          |
| `src/components/ui/form-styles.ts`, `src/components/schedule/presentation-fields.tsx`                  | Shared form styles usable by both server and client components.                                        |
| `supabase/migrations/20261008000000_administration.sql`, `src/types/database.ts`                       | Admin mutation boundary, closure state, slot revisions, and regenerated types.                         |
| `tests/unit/admin.test.ts`, `tests/database/administration.test.mjs`, `tests/database/schema.test.mjs` | Input boundaries, authorization, closure/history invariants, and retained deletion.                    |
| `tests/e2e/admin-fixtures.ts`, `tests/e2e/administration*.spec.ts`, `tests/e2e/database-locks.ts`      | Responsive admin journeys, real lock contention/revocation, and actual Storage retention/access tests. |
| `README.md`, `docs/phase-7.md`                                                                         | Current scope, migration, setup, and Success Criteria audit.                                           |

## Success Criteria audit

| Criteria  | Phase 7 status                                                                                                                                                                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–6, 8–12 | Existing authentication, scheduling, regular editing, archive, and private file behavior is preserved and covered by regression tests.                                                                                                                                                                                     |
| 7         | Historical metadata corrections now have an admin workflow. Regular users still cannot edit historical metadata; their own historical slide management is unchanged. Vancouver completion remains derived on read.                                                                                                         |
| 13–15     | Admin forms have responsive layouts, accessible labels, pending/confirmation states, validation, stale-edit feedback, empty states, and success messages. New flows are tested at desktop/tablet/mobile widths; full physical-device, hosted latency, and final cross-application review remain Phase 8/deployment checks. |
| 16        | Admin schedule extension, same-day additional slots, individual closures, and persistent holiday closures are implemented. Existing bookings and closures are preserved, including during competing mutations.                                                                                                             |
| 17        | Admin deletion retains records and stored files while hiding all application access. The tests cover real PDF/PowerPoint objects and blocked pending publication after deletion.                                                                                                                                           |

No Phase 7 feature is intentionally deferred. Phase 8's broader responsive/accessibility/error-handling/security review and hosted validation remain outstanding; this phase does not declare the entire project production-ready. Permanent deletion, restore, file retention cleanup, category-management screens, and account administration screens are not introduced.

## Verification

Lint, TypeScript checking, formatting, the production build, **16 unit tests**, **49 database tests**, and **84 browser tests** passed. The full browser suite covered desktop, tablet, and mobile, including earlier-phase regressions. Admin schedule and presentation screenshots were visually reviewed. `git diff --check` passed.

```sh
npm run check
npm run format:check
PLAYWRIGHT_CHANNEL=chrome npm run test:ui
```

Database tests execute all migrations in PGlite without Docker. Browser tests use the real local Supabase Auth/PostgREST/Storage services and deliberately held PostgreSQL row locks. They clean their own accounts, records, and file objects. Schedule-extension/holiday tests allocate an otherwise empty distant date range and remove it afterward, leaving the developer's existing schedule intact. Screenshots and traces remain ignored local artifacts.

Browser authorization assertions check the not-found screen and absence of protected content. Next.js may retain HTTP 200 after a page starts streaming, as documented in [its not-found convention](https://nextjs.org/docs/app/api-reference/file-conventions/not-found). File API checks independently require HTTP 404 after deletion, and direct RPC tests verify permission errors.
