# Phase 4 — Editing, rescheduling, and cancellation

Scope follows `REQUIREMENTS.md` Section 20. This phase completes the upcoming-presentation workflow; it does not add archive, slide storage, administrative schedule management, historical corrections, or soft deletion workflows.

## Behavior and changed files

- `src/components/schedule/slot-card.tsx` links owners to **Edit presentation** from Home and Schedule. The edit route checks current employee access, ownership/admin permission, and Vancouver date before rendering.
- `src/app/(workspace)/presentations/[id]/edit/page.tsx` and `actions.ts`, `src/lib/schedule/edit-data.ts` and `editing.ts`, and `src/components/schedule/edit-presentation-form.tsx` implement prefilled metadata editing, date/slot selection, and cancellation. The presenter remains fixed. Current/future open, unbooked slots across the full schedule are offered, including multiple slots on the same day. Same-day changes remain allowed until the following Vancouver midnight.
- `src/components/schedule/presentation-fields.tsx` shares title/category/description/reference fields with registration. Validation still requires a title, allows optional fields, limits descriptions to 500 Unicode characters, and accepts one absolute HTTP(S) URL. A previously selected inactive category may be retained or cleared, but cannot be newly selected.
- Edit and cancel controls disable while either operation is pending. Validation/conflict failures preserve the edit draft and explain how to recover. A version mismatch requires reloading the latest presentation, preventing a stale tab from overwriting an edit, undoing cancellation, or cancelling a presentation that moved after the form opened.
- Registration and edit forms prevent automatic form resets after action responses; successful submissions navigate away. This preserves date/category selections on validation errors, including the behavior reported in React's [controlled-select reset issue](https://github.com/react/react/issues/30580). See also the [React form action documentation](https://react.dev/reference/react-dom/components/form#handle-form-submission-with-an-action-prop).
- Cancellation requires opening its confirmation section, explicitly checking confirmation, and submitting. **Keep presentation** dismisses confirmation. Unsaved edits are not included in cancellation. The existing presentation and any file metadata remain; no storage object is touched.
- `src/lib/schedule/data.ts` and `src/app/(workspace)/schedule/page.tsx` show confirmations from the actual current presentation state and select the correct 12-week window after a move or cancellation. Cancelled presentations disappear from upcoming cards. Their former slots become available only while open and current/future, and until booked again.
- An existing booking on a closed slot can still have its metadata edited, be moved to an available slot, or be cancelled. Neither moving nor cancelling reopens a closed slot.
- Administrators retain their established permission to manage another employee's upcoming record via its edit URL. Dedicated administrator navigation, historical edits, schedule extension/closures, and soft deletion remain Phase 7. The present mutation functions reject completed records for all roles. Regular employees cannot open completed/other-owned edit forms or bypass these restrictions through the API.

`tests/database/editing.test.mjs` covers validation, ownership, account state, completion, atomic failure, stale versions, retained files, and closed slots. `tests/e2e/editing.spec.ts` exercises browser journeys, validation/conflict recovery, confirmation, accessibility, and responsive layouts. `tests/e2e/editing-integration.spec.ts` uses actual local PostgreSQL contention. Shared connection/lock helpers were extracted into `tests/e2e/database-locks.ts`; existing booking integration tests reuse them. `playwright.config.ts` runs API contention tests once and browser journeys on desktop, tablet, and mobile. Database types are regenerated in `src/types/database.ts`.

## Migration and concurrency

`supabase/migrations/20261005010000_editing_and_cancellation.sql` is additive:

1. Adds `presentations.revision`, starting at 1. A trigger increments it on every update, including administrative SQL updates. Existing bookings and metadata are preserved.
2. Adds `update_presentation` and `cancel_presentation`. Only authenticated callers can execute them, and each independently verifies the current active, confirmed employee and ownership/admin role. They use a fixed empty search path. Direct table writes remain denied.
3. The private shared mutation implementation locks category metadata first (when relevant), then source/destination slots in a consistent UUID order, then the presentation. It rechecks membership, ownership, revision, cancellation/deletion, and the **wall-clock Vancouver date after waiting for locks**. A move validates destination availability and changes the presentation's slot in the same transaction. Any failure rolls back metadata and slot changes together. The existing partial unique index remains the final one-active-booking-per-slot guarantee.
4. Cancellation requires explicit confirmation and sets `cancelled_at` without deleting the presentation, files, or slot. The partial unique index then permits a new active booking. Cancelled records never become Completed.

The internal helper is not executable by client roles. Public RPC arguments do not permit presenter, cancellation timestamp, soft-deletion, or file overrides. No table is dropped, no seed reruns, and no existing slot is reopened.

The migration has been applied to this local database without resetting it. Apply pending migrations to another existing local environment with:

```sh
npx supabase migration up --local
```

For a hosted Supabase project, apply the reviewed migration through the normal migration workflow before deploying the new app. No hosted migration or deployment was performed.

## Configuration and local run

There are no new environment variables, dependencies, secrets, scheduled jobs, or external services. Existing invited accounts and the three values in `.env.local` are reused.

```sh
npm ci
npm run db:start
npx supabase migration up --local
npm run dev
```

Open **http://localhost:3000**. On a fresh checkout, copy `.env.example` to `.env.local`, set the local Supabase publishable key, and follow the [README](../README.md) invitation instructions. Do not overwrite an already configured `.env.local`. Node 22.13+ (22.x) or 24.x and Docker are required for the full local stack.

Hosted Supabase/Vercel origins, Auth templates/SMTP, initial employees/admins, and initial schedule seeding still need manual configuration as documented in the README. This phase requires no additional manual data changes.

## Success Criteria audit

| Criterion                                                    | Status after Phase 4                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–3 — Sign-in, schedule, registration                        | Existing behavior retained and regression-tested. Hosted configuration is still required.                                                              |
| 4 — Metadata validation                                      | Applied to editing as well as registration, on the server and database.                                                                                |
| 5 — Concurrent bookings and rescheduling                     | Implemented; real contention tests cover moves competing with moves and registrations, with one winner and no lost source booking.                     |
| 6 — Edit, reschedule, cancel, including same-day             | Implemented. Moves are atomic; cancellation retains records/files and releases availability subject to open/current/future rules.                      |
| 7 — Midnight completion and historical metadata/files        | Date-derived status and mutation cutoffs are enforced. Archive display, historical administrative corrections, and slide management remain Phases 5–7. |
| 8–9 — Archive search/filter                                  | Deferred to Phase 5.                                                                                                                                   |
| 10–12 — PDF viewing, PPTX downloads, authenticated files     | Deferred to Phase 6. No storage access is exposed.                                                                                                     |
| 13 — Desktop/tablet/mobile                                   | Current workflows covered on all three viewport sizes with accessibility and overflow checks.                                                          |
| 14 — Responsive interactions                                 | Server rendering, pending feedback, bounded date windows, and local browser journeys. Hosted latency/load benchmarking remains outstanding.            |
| 15 — Loading/empty/success/error feedback                    | Current flows include validation, conflicts, confirmation, pending states, and retry/reload paths. Future workflows remain deferred.                   |
| 16–17 — Administrative schedule management and soft deletion | Existing schema/authorization retained; workflows remain Phase 7.                                                                                      |

No Phase 4 requirement is intentionally deferred. The entire MVP is not yet complete.

## Verification

Verified during implementation: lint, route-aware TypeScript checks, formatting, production build, 8 unit tests, and 27 database tests. All 50 browser/API scenarios passed across the regression and final targeted runs: 35 unaffected scenarios passed in the full regression run, then all 15 editing/registration scenarios passed against the final build after the form-reset fix. Those 15 include all three viewport sizes. The initial authentication timeouts did not recur on the regression rerun; authentication code and test timeouts were unchanged.

```sh
npm run check
npm run format:check
PLAYWRIGHT_CHANNEL=chrome npm run test:ui
```

Use installed Chromium without `PLAYWRIGHT_CHANNEL` if preferred. Browser tests require the local Supabase stack, local `.env.local`, and a fresh production build. They create and clean up their own temporary accounts, slots, and presentations. They do not reset the developer database or send employee notifications. Separate PostgreSQL connections deliberately hold row locks to test competing requests rather than relying on timing alone.
