# Phase 5 — Presentation archive, search, and filters

Scope follows `REQUIREMENTS.md` Sections 8 and 20. The archive and metadata detail workflow is implemented; slide upload, replacement, preview, downloads, and administrative workflows remain later phases.

## Behavior

- `/archive` lists only completed presentations. Completion is evaluated from the existing **America/Vancouver** date rule on each database read: a presentation remains Upcoming for its entire scheduled local date and becomes Completed at the following local midnight. Cancelled and soft-deleted records are excluded. Slides and an open slot are not prerequisites for archive inclusion.
- Results sort by presentation date descending, then slot number and ID ascending for deterministic ordering within a date. Pages contain up to 12 cards. Pagination clamps an out-of-range page to the last available page and retains all search/filter values.
- Each card shows title, presenter, presentation date/slot, optional category/description, and PowerPoint/PDF availability from existing file metadata. Missing optional content is omitted. Records without file metadata show **Slides are not yet available.**
- Search is case-insensitive and accepts parts of words across title, presenter name, description, and category. All whitespace-separated search terms must appear somewhere across those fields. Punctuation is literal, including `%` and `_`; there is no query language, wildcard syntax, semantic search, or external search service. Queries are limited to 200 characters after normalization.
- Presenter, category, year, and inclusive date bounds combine with the search terms. Date ranges may be open-ended. Filter options come from visible completed records, retaining former presenters and inactive categories referenced by those records. Invalid IDs, dates, years, repeated search/filter parameters, excessive search text, or reversed date ranges produce explanatory errors rather than silently broadening results. A well-formed filter that no longer matches any records returns the normal no-results state.
- Search state is stored in URL parameters (`q`, `presenter`, `category`, `year`, `from`, `to`, `page`). Search submission starts from page one. Reloading, browser history, pagination, and **Back to archive** retain the appropriate context. Return destinations are restricted to the internal archive route.
- The existing `/presentations/[id]` shell now renders actual metadata, optional reference links, and file-availability information. Historical records are read-only in this phase; no historical edit or upload controls are offered. Direct links to upcoming/cancelled visible records still work, with their actual status, and existing upcoming edit permissions are respected. Soft-deleted or missing records remain not-found for all application roles.
- Reference links are restricted to validated absolute HTTP(S) URLs and open with `noopener noreferrer`. Titles and descriptions are rendered as text. File availability never exposes storage paths, file URLs, preview frames, or download endpoints. If file metadata exists, details clearly say that preview/download access is not available yet.
- Search has pending feedback, the archive has a loading skeleton, and empty/error states explain how to recover. Layouts and filters work at desktop, tablet, and mobile widths.

## Files changed

| Files                                                                     | Purpose                                                                                                        |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/app/(workspace)/archive/page.tsx`, `loading.tsx`                     | Live archive, results summary, pagination, and loading/empty/validation states.                                |
| `src/app/(workspace)/presentations/[id]/page.tsx`                         | Protected metadata detail page and safe return navigation.                                                     |
| `src/components/archive/*`                                                | Search/filter form and pending button, archive cards, shared file-availability display.                        |
| `src/lib/archive/filters.ts`                                              | Server input validation, date parsing, page/query serialization, safe archive return paths.                    |
| `src/lib/archive/data.ts`                                                 | Employee-authorized archive/options/count/page queries and detail mapping.                                     |
| `supabase/migrations/20261006000000_archive.sql`, `src/types/database.ts` | Read-only database objects and regenerated query types.                                                        |
| `tests/unit/archive.test.ts`, `tests/database/archive.test.mjs`           | Filter validation, search semantics, completion, visibility, permissions, and optional-file behavior.          |
| `tests/e2e/archive-fixtures.ts`, `archive.spec.ts`                        | Real local Supabase archive journeys, accessibility, filtering, pagination, details, and retained URL context. |
| `tests/e2e/authentication.spec.ts`                                        | Existing detail-route authorization test now expects the actual presentation title.                            |
| `README.md`, `docs/phase-5.md`                                            | Current scope, setup, migration notes, and Success Criteria status.                                            |

Next.js also regenerates `next-env.d.ts` type-import paths during checks/builds.

## Migration

`20261006000000_archive.sql` adds three read-only database objects:

1. `archive_presentations`, a security-invoker view over the existing overview filtered to Completed. The existing underlying RLS and soft-deletion rules apply.
2. `search_archive`, a stable security-invoker function with typed query/filter arguments and database input validation. It applies literal substring search and filters to that view. The application uses an exact count followed by an ordered range query, so only one page of complete records is transferred.
3. `archive_filter_options`, a stable security-invoker function deriving distinct presenter/category/year options from the visible archive.

Only authenticated roles receive SELECT/EXECUTE privileges, and employee membership remains independently checked by RLS and the search function. Anonymous access is denied. Deactivated, banned, unlinked, and unfinished accounts cannot retrieve archive data. No new mutation privileges are granted.

There are no new tables, extensions, search indexes, storage objects, data backfills, or changes to existing records. The initial schedule seed is unchanged. No scheduled completion job is necessary. These ordinary PostgreSQL reads are appropriate for the expected 30–50 employees; a dedicated search index/service is unnecessary for the initial workload.

The migration has been applied locally without resetting the database. Apply it to another existing local checkout with:

```sh
npx supabase migration up --local
```

Apply pending migrations to hosted Supabase through the normal migration workflow before deploying the app. No hosted migration or deployment was performed.

## Configuration and running locally

No new environment variables, packages, secrets, or external services are needed. Reuse the existing `.env.local` and invited accounts.

```sh
npm ci
npm run db:start
npx supabase migration up --local
npm run dev
```

Open **http://localhost:3000**. Fresh checkouts still need the three values from `.env.example` and invited users configured as described in the [README](../README.md). Do not overwrite an already configured `.env.local`. Existing hosted Supabase/Vercel origins, Auth/SMTP setup, and employee/admin provisioning remain manual deployment configuration.

No manual archiving or file upload is required for a completed presentation to appear. The archive may correctly be empty until a scheduled presentation date has passed.

## Success Criteria audit

| Criterion                                                             | Status after Phase 5                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–6 — Authentication, scheduling, registration, editing, cancellation | Retained from prior phases; regression coverage remains in place.                                                                                                                                                           |
| 7 — Midnight completion and historical permissions                    | Completed records now appear in the archive based on Vancouver dates, even without files. Regular-user metadata restrictions remain enforced. Historical slide management and administrative corrections remain Phases 6–7. |
| 8 — Search historical presentations                                   | Implemented across all four required fields with partial, case-insensitive matches.                                                                                                                                         |
| 9 — Filter historical presentations                                   | Implemented for presenter, category, year, and inclusive date ranges, individually or combined.                                                                                                                             |
| 10 — Historical detail and PDF preview                                | Metadata detail view is implemented. PDF viewing remains Phase 6.                                                                                                                                                           |
| 11–12 — PowerPoint downloads and authenticated file access            | File availability is shown, but file endpoints/storage workflows remain Phase 6. No public file access is introduced.                                                                                                       |
| 13 — Desktop/tablet/mobile                                            | Archive, filters, pagination, and detail layouts are covered at all three sizes.                                                                                                                                            |
| 14 — Responsive interactions                                          | Paginated reads, exact result counts, pending/loading feedback, and local browser checks. Hosted load/latency benchmarking remains outstanding.                                                                             |
| 15 — Loading, empty, success, and error feedback                      | Archive-specific loading, count/no-results, filter validation, and retry behavior are implemented alongside existing mutation confirmations.                                                                                |
| 16–17 — Administrative schedule management and soft deletion          | Existing schema/security retained; workflows remain Phase 7. Deleted records are excluded from archive results and options and cannot be opened.                                                                            |

No Phase 5 requirement is intentionally deferred. The full MVP remains incomplete until later phases are implemented and verified.

## Verification

Verified locally: lint, TypeScript checking, formatting, and the production build passed. All **11 unit tests**, **34 database tests**, and **59 browser tests** passed, including earlier-phase regressions and archive journeys at desktop, tablet, and mobile sizes. Desktop and mobile archive screenshots were also visually reviewed. `git diff --check` passed.

```sh
npm run check
npm run format:check
PLAYWRIGHT_CHANNEL=chrome npm run test:ui
```

Use downloaded Chromium without `PLAYWRIGHT_CHANNEL` if preferred. Database tests run real SQL through PGlite without Docker. Browser tests require the local Supabase stack, `.env.local`, and a fresh production build; they create and clean up only their own test accounts, slots, metadata, and categories. They never reset developer data or create real storage files.

The implementation uses the standard [Next.js Form navigation/pending behavior](https://nextjs.org/docs/app/api-reference/components/form) and [Supabase RPC API](https://supabase.com/docs/reference/javascript/rpc). No additional browser database client or search infrastructure is introduced.
