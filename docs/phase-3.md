# Phase 3 — Scheduling and registration

Scope follows `REQUIREMENTS.md` Section 20: upcoming presentations, multiple slots per day, schedule horizon, and booking. No editing, rescheduling, cancellation, archive, storage, or admin workflow is added.

## Behavior

- Home features the next scheduled presentation and up to four more upcoming presentations. It also shows up to five available slots on the next date with an opening, including when that date has no booked presentation. Links lead to the full schedule.
- The schedule starts on today's **America/Vancouver** date. The default window is `[today, today + 84 calendar days)`. Previous/next controls move through subsequent 12-week windows until the last existing slot. Non-Tuesday dates and multiple same-day slots are supported. Closed slots remain visible without a booking action; existing bookings on closed slots remain displayed.
- Registration fixes the chosen date/slot and presenter to the selected slot and authenticated employee. Only a title is required. Category, description (at most 500 Unicode code points), and one absolute HTTP(S) reference URL are optional. Blank optional fields are stored as null and omitted from cards. Slides are not required.
- Submission disables the form while pending. Field errors, stale availability, inactive categories, and transient failures retain the draft on the page. Success redirects to the appropriate schedule window with the registered presentation and a confirmation banner. Optional reference links open safely in another tab.
- Dates, titles, availability, categories, and employee access are checked on the server/database. Cancelled and soft-deleted presentations do not occupy the displayed slot. Past or closed slots stay unbookable even if an earlier presentation was cancelled/deleted.

## Migration

`supabase/migrations/20261005000000_scheduling_and_registration.sql` is additive:

1. `public.schedule_slots` is a read-only, security-invoker view joining slots to their non-cancelled, non-deleted booking, presenter, and category. Underlying RLS applies. Anonymous access remains denied.
2. `public.register_presentation(slot, title, category, description, reference_url)` is the only new mutation capability. It resolves the active, confirmed employee from `auth.uid()` and never accepts a presenter/date/status override. It validates metadata, locks the selected slot, checks membership again, then checks its open state and the **wall-clock Vancouver date after waiting for the lock**. The insert and checks are one transaction. A competing booking receives a conflict; it cannot overwrite the winner.
3. The existing partial unique index on `presentations.slot_id` remains the final guarantee against duplicate active bookings. Direct insert/update/delete grants remain revoked. The function has a fixed empty search path and is executable only by authenticated users; deactivated, unlinked, banned, or unfinished accounts fail its employee check.

No table is recreated, no existing records or closures are rewritten, and no seed is rerun. The initial six-month seed from Phase 1 remains unchanged. New query types are generated in `src/types/database.ts`.

The locking design follows [PostgreSQL row-lock semantics](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS) and the restricted-function pattern in [Supabase database functions](https://supabase.com/docs/guides/database/functions).

## Setup

The migration has been applied to the local project during implementation. For another existing local checkout:

```sh
npm ci
npm run db:start
npx supabase migration up --local
npm run dev
```

Keep the Phase 2 `.env.local` values and employee invitations. There are **no new environment variables, secrets, cron jobs, or external services**. For a new checkout, configure `.env.local` and invite an employee as described in the README. `supabase/seed.sql` runs on initial local setup/reset; if a hosted project has not been seeded, apply that reviewed initial seed through Supabase administration. Applying the new migration alone does not create schedule dates.

Hosted deployment still needs the existing Supabase/Vercel project, Auth/SMTP configuration, initial employees/administrator, and all pending migrations. Apply migrations before serving the updated application. No hosted migration or deployment was performed here. Schedule extension and holiday-management UI remain Phase 7; existing dates/closures are read from the database.

## Success Criteria audit

| Criterion                                                                        | Status after Phase 3                                                                                                                                             |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Invite-only sign-in                                                          | Implemented in Phase 2; regression-tested. Hosted configuration still required.                                                                                  |
| 2 — Available/booked slots, multiple slots, six months/12 weeks                  | Implemented; seed, date grouping, default boundary, and later navigation tested.                                                                                 |
| 3 — Open current/future Vancouver slots only                                     | Implemented in UI, server, and transaction; past/closed/missing slots rejected.                                                                                  |
| 4 — Required title; optional category, ≤500-character description, reference URL | Implemented and validated on both server and database.                                                                                                           |
| 5 — No duplicate bookings, including concurrency                                 | Concurrent registration and independent same-day slots implemented/tested. Rescheduling remains Phase 4.                                                         |
| 6 — Edit, reschedule, cancel                                                     | Not implemented; Phase 4.                                                                                                                                        |
| 7 — Midnight completion, archive inclusion, historical metadata/files            | Status calculation and permission separation exist. Archive display and slide management remain Phases 5–6.                                                      |
| 8–9 — Archive search and filters                                                 | Not implemented; Phase 5.                                                                                                                                        |
| 10–12 — PDF preview, PPTX download, protected file access                        | Not implemented; Phase 6. No storage buckets or file endpoints are exposed.                                                                                      |
| 13 — Desktop/tablet/mobile                                                       | Implemented and tested for existing pages and registration. Future workflows still need their own checks.                                                        |
| 14 — Responsive interactions                                                     | Server-rendered reads, date windows, no shared data cache, pending feedback. Browser checks cover normal local use; no hosted load/latency benchmark is claimed. |
| 15 — Loading, empty, success, error states                                       | Implemented for current workflows, with registration validation/conflicts and retry paths tested. Future workflow states remain deferred.                        |
| 16 — Admin schedule extension and closures                                       | Initial seed is safe to rerun; closed slots are respected. Admin workflows remain Phase 7.                                                                       |
| 17 — Admin soft deletion and hidden retained files                               | Schema and read filtering exist and are tested. Admin deletion and file-access workflows remain Phases 6–7.                                                      |

This phase completes the scheduling and registration portion of the MVP; it does not mark the entire MVP complete.

## Verification

- `npm run check`: lint, TypeScript, unit tests, PostgreSQL migration/RLS tests, and production build.
- `npm run format:check`: formatting.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:ui`: desktop/tablet/mobile journeys and accessibility, plus real local Supabase booking contention, closure, and deactivation tests. Use downloaded Chromium without `PLAYWRIGHT_CHANNEL` if preferred.

Tests create and clean up only their own local accounts and slots. They do not reset the developer's database or send employee notifications. The in-memory PostgreSQL tests cover constraints and permissions; the separate-connection Supabase tests cover actual locking/concurrency.
