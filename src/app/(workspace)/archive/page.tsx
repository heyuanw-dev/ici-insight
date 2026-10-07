import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ArchiveFilters } from "@/components/archive/archive-filters";
import { ArchiveCard } from "@/components/archive/archive-card";
import { getArchive } from "@/lib/archive/data";
import { archiveHref, type ArchiveQuery } from "@/lib/archive/filters";

export const metadata: Metadata = { title: "Presentation archive" };

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<ArchiveQuery>;
}) {
  const archive = await getArchive(await searchParams);
  const currentHref = archiveHref(archive.filters, archive.page);
  return (
    <>
      <PageHeader
        eyebrow="The conversations continue"
        title="Presentation archive"
        description="Revisit the research, tools, and perspectives shared by the team. A growing collection of our collective knowledge."
      />
      <ArchiveFilters
        filters={archive.filters}
        options={archive.options}
        errors={archive.errors}
      />
      {!archive.valid ? (
        <div
          role="alert"
          className="panel border-brand/30 bg-brand-soft p-6 text-sm leading-7 text-brand"
        >
          Check the highlighted search and filter fields, then try again.
        </div>
      ) : (
        <section aria-labelledby="archive-results-heading">
          <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <h2 id="archive-results-heading" className="text-lg font-semibold">
              Completed presentations
            </h2>
            <p role="status" className="text-sm text-muted">
              {archive.total
                ? `Showing ${archive.start + 1}–${archive.start + archive.items.length} of ${archive.total}`
                : "0"}{" "}
              {archive.total === 1 ? "presentation" : "presentations"} · Newest
              first
            </p>
          </div>
          {archive.items.length ? (
            <>
              <div className="grid items-stretch gap-5 md:grid-cols-2">
                {archive.items.map((presentation) => (
                  <ArchiveCard
                    key={presentation.id}
                    presentation={presentation}
                    returnTo={currentHref}
                  />
                ))}
              </div>
              {archive.pages > 1 && (
                <nav
                  aria-label="Archive pages"
                  className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6"
                >
                  <p className="text-sm text-muted">
                    Page {archive.page} of {archive.pages}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {archive.page > 1 && (
                      <ButtonLink
                        href={archiveHref(archive.filters, archive.page - 1)}
                        variant="secondary"
                      >
                        Previous page
                      </ButtonLink>
                    )}
                    {archive.page < archive.pages && (
                      <ButtonLink
                        href={archiveHref(archive.filters, archive.page + 1)}
                        variant="secondary"
                      >
                        Next page
                      </ButtonLink>
                    )}
                  </div>
                </nav>
              )}
            </>
          ) : (
            <div className="panel">
              <EmptyState
                icon="book"
                title={
                  archive.hasFilters
                    ? "No presentations match your search."
                    : "No completed presentations yet"
                }
                description={
                  archive.hasFilters
                    ? "Try a different keyword or broaden your filters."
                    : "Presentations appear here after their scheduled date ends in Vancouver, even when slides have not been uploaded."
                }
              >
                <ButtonLink
                  href={archive.hasFilters ? "/archive" : "/schedule"}
                  variant="secondary"
                >
                  {archive.hasFilters
                    ? "Show all presentations"
                    : "Explore the schedule"}
                </ButtonLink>
              </EmptyState>
            </div>
          )}
        </section>
      )}
    </>
  );
}
