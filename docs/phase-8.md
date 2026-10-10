# Phase 8 — testing, accessibility, and security

This phase reviews the existing MVP against `REQUIREMENTS.md`. It adds no future product features, database tables, migrations, Storage policies, or environment variables. Existing local data was preserved; tests create and remove their own accounts, slots, presentations, and objects.

## Changes

- Each page response now has a cryptographically random Content Security Policy nonce. Next.js receives the trusted request policy and renders its scripts with that nonce. Caller-supplied nonce/policy headers are overwritten. Pages use dynamic rendering, deny embedding, prohibit executable HTML attributes and unapproved scripts, and restrict connections to the app and configured Supabase origin. Development alone permits the evaluation/WebSocket behavior needed for hot reload. Inline CSS remains allowed for framework/layout styles; inline JavaScript does not. The policy follows the [Next.js nonce guidance](https://nextjs.org/docs/app/guides/content-security-policy).
- Common responses disable MIME sniffing, referrer disclosure, and camera/microphone/location permissions. Private pages, authentication redirects, and API errors stay uncached. HTTPS deployments receive HSTS. Authenticated PDF responses retain their separate same-origin framing policy so the native browser viewer continues to work.
- Upload preparation accepts JSON only and enforces a 4,096-byte limit while reading the stream, including requests without an honest Content-Length. Oversized bodies are cancelled before the remaining data is buffered. File bytes still travel directly to private Storage; this limit applies only to preparation metadata.
- Form feedback focuses the first invalid field or the returned message after a submission. Field errors are associated with their controls. Administrative cancellation/deletion can be dismissed with **Keep presentation** or Escape, returning focus to the original control. Regular cancellation also supports Escape. Upload errors have an associated, focused message; failed connections and non-JSON responses have readable retry instructions and preserve the selected file.
- Input borders have at least 3:1 contrast against their light backgrounds. Inputs and fieldsets can shrink on narrow screens; Home actions and shared page headers wrap instead of overflowing when text is enlarged. Existing focus outlines, reduced-motion handling, semantic regions, labels, skip navigation, and confirmation/success states remain in use.
- Next.js and `eslint-config-next` are updated together from 16.3.8 to 16.4.0. No new third-party library is introduced. Automatic framework-generated agent instruction files are disabled to keep development from adding unrelated repository files.
- `npm run test:security` checks current tracked/untracked source and the production browser build for the configured privileged key, recognizable Supabase service-role/secret keys, server credential references in browser assets, and accidentally tracked local environment files. It prints filenames, never credential values. This is a targeted leakage check, not a general-purpose historical secret scanner. `npm run check` includes it after building.

## Files changed

| Files                                                                                                                                                                        | Purpose                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/proxy.ts`, `src/lib/security/headers.ts`, `next.config.ts`, `src/app/layout.tsx`                                                                                        | Browser policy, per-response nonces, dynamic rendering, security headers, cache protection.                                           |
| `src/lib/security/request-body.ts`, `src/lib/files/server.ts`, `src/app/api/presentations/[id]/files/uploads/route.ts`                                                       | Bounded JSON parsing and safe HTTP errors.                                                                                            |
| `src/components/ui/use-form-feedback.ts`, auth/schedule/admin form components                                                                                                | Accessible error focus, associated messages, dismissible confirmations.                                                               |
| `src/components/files/file-manager.tsx`                                                                                                                                      | Accessible upload feedback and recoverable connection/response failures.                                                              |
| `src/app/globals.css`, `src/app/(workspace)/page.tsx`, `src/components/ui/form-styles.ts`, `src/components/ui/page-header.tsx`, `src/components/archive/archive-filters.tsx` | Input contrast and narrow-screen reflow.                                                                                              |
| `tests/unit/security.test.ts`, `tests/e2e/{security-integration,feedback,reflow-integration}.spec.ts`                                                                        | Request bounds, CSP enforcement, cross-origin rejection, keyboard/error recovery, pending submissions, reflow, local timing evidence. |
| `scripts/check-secrets.mjs`, `package.json`, `package-lock.json`                                                                                                             | Build leakage check, current framework/lint versions, repeatable check command.                                                       |
| `README.md`, `docs/phase-8.md`                                                                                                                                               | Setup, security boundaries, verification, and final requirements audit.                                                               |

## Success Criteria audit

“Verified locally” means tests run against the production build and real local Supabase services, supplemented by unit and SQL tests. It does not assert hosted performance or physical-device/screen-reader certification.

| #   | Requirement                                                          | Evidence / status                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Secure invited sign-in; no public registration                       | Auth tests cover invitation/setup/recovery/sign-out, cookies, revoked accounts, role forgery, and rejection of direct public signup. Hosted Auth settings and SMTP must be configured separately.                                                                         |
| 2   | Available/booked multiple slots; six-month initial / 12-week default | Seed, date-range and schedule tests cover the horizon, independent same-day slots, status and navigation.                                                                                                                                                                 |
| 3   | Current/future Vancouver booking only                                | SQL and real-service tests reject closed/past slots and revoked accounts, including after lock waits.                                                                                                                                                                     |
| 4   | Required title; optional category, 500-character description and URL | Unit, database, and browser validation tests cover limits, Unicode, optional values, HTTP(S) links and preserved drafts.                                                                                                                                                  |
| 5   | No duplicate booking under contention                                | Partial unique index plus real concurrent registration/rescheduling tests; independent slots on one date remain bookable.                                                                                                                                                 |
| 6   | Own upcoming edits/moves/cancellation                                | Owner/admin SQL checks, same-day edits, stale/conflicting changes, and atomic reservation/cancellation tests. Cancellation retains records.                                                                                                                               |
| 7   | Vancouver completion, archive, historical permissions                | Status is derived on read at the following local midnight; SQL tests cover both DST transitions. Historical metadata requires admin; presenters can replace their completed slides. No scheduled completion job is needed.                                                |
| 8   | Historical search                                                    | Archive tests exercise literal partial-word title/description/presenter/category search and empty results.                                                                                                                                                                |
| 9   | Historical filters                                                   | Category/presenter/year/date filters, combined queries, validation and pagination are covered.                                                                                                                                                                            |
| 10  | In-browser PDF preview                                               | Real uploads, authenticated inline responses, byte ranges, version replacement and viewer policy regression tests. Native PDF UI remains browser-owned.                                                                                                                   |
| 11  | Original PowerPoint download                                         | Browser download bytes match the uploaded original; filenames and replacement behavior are covered.                                                                                                                                                                       |
| 12  | Private employee-only files                                          | Anonymous, unrelated, revoked, soft-deleted, direct Storage and pending-publication cases are tested; private bucket, server-only credentials and authenticated streaming remain enforced.                                                                                |
| 13  | Desktop/tablet/mobile usability                                      | Full browser suite at 1440, 768 and 390 CSS pixels; additional 320-pixel reflow and 200% text tests, axe audits and screenshot review. Physical devices and assistive technology require a deployment acceptance pass.                                                    |
| 14  | Responsive interactions                                              | Production build, server-rendered pages, limited schedule/archive queries, system fonts, direct Storage uploads, pending controls and recorded local page/navigation timings. Actual hosted network latency, concurrency and a maximum-size upload remain to be measured. |
| 15  | Clear loading/empty/success/error states                             | Existing empty/conflict/success journeys plus delayed submission, repeated validation focus, sign-in retry, interrupted upload and non-JSON service failure tests.                                                                                                        |
| 16  | Admin extension, same-day slots and holidays                         | Repeatable extensions preserve closures/bookings; SQL and browser tests cover slot/date changes, holidays and concurrent operations.                                                                                                                                      |
| 17  | Soft deletion with retained files                                    | Real Storage tests verify record/object retention and blocked pages, previews, downloads and publication, even for admins.                                                                                                                                                |

No requested MVP feature is intentionally deferred. Criteria 13–14 still need real deployment/device acceptance before claiming the whole application is production-validated. Automated axe and keyboard checks do not establish complete WCAG conformance.

## Verification and limits

Lint, strict TypeScript checking, **21 unit tests**, **49 database tests**, the production build, and the source/browser credential check passed. The full **102-test browser suite** passed across desktop, tablet and mobile. After the final form-button wrapping adjustment, both focused reflow/timing checks passed again against the rebuilt application. Control border contrast is 3.65:1 against white and 3.41:1 against the canvas; normal muted and brand/button text exceed 4.5:1. Narrow-screen and enlarged-text screenshots were reviewed. A separate visible Chrome check rendered the native PDF page and controls with zero policy violations; headless screenshots alone do not establish native PDF rendering.

Local production observations during the parallel browser run (one sample per page, not a hosted performance guarantee):

| Route    | Response start | DOM content loaded |
| -------- | -------------- | ------------------ |
| Home     | 346 ms         | 506 ms             |
| Schedule | 423 ms         | 485 ms             |
| Archive  | 730 ms         | 794 ms             |

Client navigation from Archive to Schedule took 479 ms. The repeatable timing test writes `local-performance.json` under its ignored `test-results` directory.

```sh
npm run check
npm run format:check
PLAYWRIGHT_CHANNEL=chrome npm run test:ui
npm audit --omit=dev
```

Use `npx playwright install chromium` and omit `PLAYWRIGHT_CHANNEL` if Chrome is unavailable. Browser tests require the local Docker Supabase stack, its matching `.env.local`, and a fresh production build. They never reset the database or target hosted services. The cross-origin Server Action test deliberately produces an invalid-origin server error; this is expected rejection. Traces/screenshots can contain test credentials and remain ignored local artifacts.

The production dependency audit reports zero known vulnerabilities. The full audit still reports five high-severity development dependency entries originating from the single unpatched [braces advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), through lint tooling. At review time, 3.0.3 is the latest `braces` release and is affected. The suggested forced fix downgrades the Next.js lint configuration to an incompatible older major; it was not applied. Recheck upstream updates before release. This is an unresolved tooling dependency issue, not a clean full dependency audit.

## Manual configuration and deployment acceptance

There are no Phase 8 database migrations or new environment variables. Preserve the existing `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. Install the updated lockfile with `npm ci`, then use the [README local setup](../README.md#run-locally). Restart any already-running development server so it loads Next.js 16.4.0. The existing development server was restarted to load the updated framework; login and recovery navigation passed a development smoke check with no runtime or CSP errors. The automated suite uses a separate freshly started production server on port 3100.

Before production use:

1. Complete the existing [hosted Supabase/Vercel setup](../README.md#hosted-supabase--vercel-setup): migrations, canonical HTTPS origins, invite-only Auth, email templates/SMTP, initial invitations/admin role, and private Storage limits. `APP_URL` must be the browser's actual canonical origin; do not add broad origin/CSP exceptions to compensate for a mismatch.
2. On that origin, check invite/recovery delivery, Secure cookies, CSP/HSTS headers, cross-user isolation, PDF preview/download, and a 50 MB upload under the deployed function/network limits. No deployment was performed in this phase.
3. Review keyboard focus and form announcements with a screen reader, 200% browser zoom, and actual desktop/tablet/phone browsers. Check the browser's native PDF controls separately; they are outside the application's axe scan.
4. Measure hosted page/navigation latency and representative concurrent usage for the expected 30–50 employees. Local timings are evidence of local behavior only.
5. Recheck the upstream development dependency advisory and upgrade when a compatible patch is available.
