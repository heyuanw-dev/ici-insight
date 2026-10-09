# Phase 6 — Private presentation files

Scope follows `REQUIREMENTS.md` Sections 9, 15, 18, and 20. This phase implements PowerPoint/PDF upload and replacement, authenticated downloads, and browser PDF preview. It does not implement automatic conversion or Phase 7 administrative metadata/schedule workflows.

## Behavior

- On `/presentations/[id]`, a presenter can upload or replace their own `.pptx` and `.pdf` independently, before or after completion. Presentation titles on Home and Schedule link to details so upcoming files are reachable too. An active administrator can manage either file for any visible presentation. File changes do not modify historical title, description, category, reference URL, presenter, slot, or metadata revision.
- The default maximum is **50 MB (52,428,800 bytes) per file**. Slides remain optional; a PDF may be uploaded without a PowerPoint, and completed records without files remain archived.
- Forms display accepted types, the size limit, current filenames, upload progress, pending validation, success confirmation, and retry/reload errors. Concurrent submission controls are disabled. Replacing PowerPoint does not automatically change its PDF; the form reminds the presenter to update the preview when its content changes.
- Every attempt uses a unique immutable object path. The previous file remains current until the replacement passes server validation and a database transaction publishes it. A stale page or competing save receives a conflict instead of overwriting a newer file. Repeating a successful completion request is safe.
- PowerPoint downloads use the original filename and exact uploaded bytes. PDF responses are served inline through the application with byte-range support. File links include the current version; requests for a replaced version ask the user to reopen the latest slides instead of mixing old and new PDF byte ranges. The detail page embeds the PDF and includes a new-tab link for browsers that cannot render an embedded preview.
- Cancelled records and their files remain retained and accessible by their protected detail link, consistent with existing visibility rules. Soft-deleted records cannot prepare/publish files or access previews/downloads; stored bytes are retained. Anonymous, unlinked, inactive, unfinished, banned, and deleted identities cannot access file workflows.

## File flow and access

1. A same-origin POST uses the employee's verified server session and `presentation_permissions`. `prepare_file_upload` independently checks ownership/admin rights, validates metadata, snapshots the current file ID, and records a two-hour upload intent.
2. A server-only service-role client creates an upload-only URL for that exact path with overwrite disabled. The browser transfers bytes directly to Supabase Storage, showing progress. No application session or privileged key is exposed to browser JavaScript.
3. A second same-origin POST loads the intent for the authenticated uploader and presentation, reads the stored bytes, validates them, and calls the service-role-only `complete_file_upload` function. SQL rechecks current membership, ownership/admin role, deletion, expiry, stored MIME/size, and the expected current file ID before publishing atomically.
4. Read endpoints use the employee session to authorize the presentation and read its current file reference under RLS. Only then does the server stream the private object. Every GET, HEAD, and PDF range request checks access again. Responses use `private, no-store`, explicit MIME types, safe content disposition, and `nosniff`.

The bucket is private and grants no client Storage access policies. The application never issues signed **read** URLs, so there is no read-token grace period after soft deletion/deactivation. An upload-only token can remain usable until its two-hour expiry, but it cannot read or overwrite objects, and a revoked uploader cannot publish its bytes. Already downloaded bytes or an already-authorized in-flight response cannot be recalled.

Direct Storage uploads avoid [Vercel's request-body limit](https://vercel.com/docs/errors/function_payload_too_large). Download responses use [streaming](https://vercel.com/docs/functions/streaming-functions). Supabase documents the [upload-only signed URL lifetime and permissions](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl). Standard uploads are used for this small internal app; interrupted transfers can be retried without damaging the current file.

## Validation and retention

Client checks improve feedback; server/database checks remain authoritative. Extension, filename, MIME, nonzero byte size, configured bucket limit, and actual stored byte count are checked. Empty or generic OS-reported MIME values are accepted only alongside the correct extension; the transfer uses the canonical MIME and the server inspects content.

PDF validation checks the PDF signature/version and final EOF marker. PowerPoint validation uses [`yauzl`](https://github.com/thejoshwolfe/yauzl) to inspect the ZIP container and required PowerPoint content-types/presentation XML, reject encrypted/macro-enabled/unsafe-path containers, and bound XML decompression to 2 MB per inspected part and traversal to 20,000 entries. This is format validation, not antivirus scanning or a guarantee that every document will render correctly in every viewer. No slides/media are extracted to disk, and no external preview/conversion service receives files.

Superseded objects and abandoned upload intents/objects remain private and inaccessible through normal reads. Content rejected by validation is marked failed and removed from Storage best-effort. Automatic garbage collection, permanent deletion, and retention policies remain undefined in the requirements and are not introduced here. Monitor bucket usage; define retention before bulk cleanup. Never delete `storage.objects` rows directly to clean binaries. Current file references—including those belonging to soft-deleted presentations—must be preserved.

## Migration

`supabase/migrations/20261007000000_files.sql` adds:

- The private `presentation-slides` bucket with PDF/PPTX MIME restrictions and a 50 MB limit.
- `presentation_file_uploads`, an RLS-enabled intent table with presentation/uploader links, immutable paths, expected file IDs, expiry, and success/failure timestamps. Neither application role can read or write this table directly.
- `prepare_file_upload`, an authenticated, permission-checked preparation RPC.
- `complete_file_upload`, callable only by the server's service role after byte validation. It locks the intent/presentation, rechecks authorization and the expected file, and atomically inserts/replaces the current reference in `presentation_files`.

Existing metadata, presentations, schedule rows, and files are not rewritten or deleted. No binaries are stored in PostgreSQL. Database types were regenerated. The migration was applied to the existing local database without resetting it. Apply it to another existing local checkout with:

```sh
npx supabase migration up --local
```

Apply pending migrations to hosted Supabase before deploying. No hosted migration or deployment was performed.

## Configuration and local run

One new variable is required: **`SUPABASE_SERVICE_ROLE_KEY`**, used only on the server. Keep it separate from `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; never commit it. The current workspace's local key was added to its ignored `.env.local` without displaying it or overwriting other settings. Fresh checkouts need all four values from `.env.example`.

```sh
npm ci
npm run db:start
npx supabase migration up --local
npm run dev
```

Use Node 22.13+ (22.x) or 24.x and Docker. Preserve an existing `.env.local`; otherwise copy `.env.example` and configure both local keys. Open **http://localhost:3000**. Invited accounts, local Studio (`54323`), Mailpit (`54324`), and initial administrator setup remain as described in the [README](../README.md). Restart the app after changing environment values.

For hosted use, set the server-only service-role key in Vercel, apply the migration, and confirm the project-wide Storage limit is at least the bucket's limit. Keep `APP_URL` equal to the canonical origin because file POSTs verify it. Existing Auth origins, SMTP, invited employees, and admin provisioning still need hosted configuration. Test maximum-size transfers and PDF viewing on the deployed origin.

The bucket's `file_size_limit` is the size configuration read by the UI, API, and SQL. Change it via Supabase bucket settings or a follow-up configuration migration; if raising it, also raise the project-wide Storage limit and local `[storage].file_size_limit` as applicable. PDF/PPTX definitions live in `src/lib/files/config.ts`, with matching MIME restrictions in the bucket and SQL; adding another format requires its own server validation and is outside this phase.

## Files changed

`src/components/schedule/slot-card.tsx` also links booked titles on Home and Schedule to their protected details and file controls.

| Files                                                                        | Purpose                                                                                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(workspace)/presentations/[id]/page.tsx`, `src/lib/archive/data.ts` | Connect separate file permissions and the completed file section to existing details.                                                    |
| `src/components/files/*`                                                     | Upload/replacement forms, progress/feedback, download links, and PDF embed/fallback.                                                     |
| `src/lib/files/*`                                                            | Shared file types/limits, bounded content validation, metadata reads, request guards, and error mapping.                                 |
| `src/lib/supabase/storage-admin.ts`                                          | Server-only privileged Storage client and streaming fetch.                                                                               |
| `src/app/api/presentations/[id]/files/**/route.ts`                           | Preparation, validation/publication, and authenticated GET/HEAD endpoints.                                                               |
| `src/proxy.ts`                                                               | Return 401 for unauthenticated API requests instead of rendering login inside file responses.                                            |
| `supabase/migrations/20261007000000_files.sql`, `src/types/database.ts`      | Bucket, private intent table, mutation RPCs, and generated types.                                                                        |
| `.env.example`, `supabase/config.toml`, `package.json`, `package-lock.json`  | Private file setup and the small ZIP validation dependency/types.                                                                        |
| `tests/unit/files.test.ts`, `tests/fixtures/slides.ts`                       | Input/content tests and real small PDF/PPTX fixtures.                                                                                    |
| `tests/database/files.test.mjs`, `helpers.mjs`, `schema.test.mjs`            | File publication/authorization/integrity tests and managed Storage schema stubs.                                                         |
| `tests/e2e/files*.ts`, `tests/e2e/archive.spec.ts`                           | Real Storage flows, replacement, limits, authorization, preview/download, responsive/accessibility checks, updated archive expectations. |
| `README.md`, `docs/phase-6.md`                                               | Setup, behavior, migration, limitations, and Success Criteria audit.                                                                     |

## Success Criteria audit

| Criteria | Phase 6 status                                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–6, 8–9 | Prior authentication, scheduling, metadata changes, and archive behavior are retained and included in regression tests.                                                                                                                  |
| 7        | Presenters can upload/replace completed slides without gaining historical metadata edit permission. Admin historical metadata correction UI remains Phase 7.                                                                             |
| 10       | PDF files appear in the browser on the protected detail page, with a new-tab fallback. Missing previews have a clear state.                                                                                                              |
| 11       | Original PowerPoint files download with their original filename and bytes.                                                                                                                                                               |
| 12       | Employee checks cover uploads, publication, downloads, and PDF range requests; no public bucket or signed read link is introduced.                                                                                                       |
| 13–15    | Responsive file forms, native PDF view/fallback, progress, validation, conflicts, empty/success/error states, and automated accessibility checks are included. Hosted latency and physical-device verification remain deployment checks. |
| 16–17    | Administrative scheduling and soft-delete UI remain Phase 7. Existing deletion flags are respected for every file workflow, and stored objects survive soft deletion.                                                                    |

No Phase 6 requirement is intentionally deferred. Full MVP completion still depends on later administrative work and final cross-application/deployment review.

## Verification

Local lint, TypeScript checking, formatting, production build, **15 unit tests**, **41 database tests**, and **68 browser tests** passed. The full browser suite covered desktop, tablet, and mobile, including earlier-phase regressions. Real Storage checks covered full 50 MB transfers, exact downloads, both file types' replacement, competing saves, rejected/interrupted uploads, stale PDF ranges, and revoked/deleted access. A headed Chrome run was visually reviewed to confirm actual PDF rendering. The server-only key was verified absent from generated browser assets. `git diff --check` passed.

```sh
npm run check
npm run format:check
PLAYWRIGHT_CHANNEL=chrome npm run test:ui
npm audit --omit=dev
```

Unit/database tests need no Docker. Browser tests require the local Supabase stack, both local keys, and a fresh production build. They create and clean only their own accounts, metadata, and real private file objects. Do not publish ignored screenshots/traces, which can contain test upload tokens.

Production dependency audit reports no vulnerabilities. The existing development-only lint dependency chain has an upstream `braces` advisory (five affected dependency entries); no unrelated forced tooling downgrade was performed.
