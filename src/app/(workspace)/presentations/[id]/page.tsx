import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button-link";
import { FileAvailability } from "@/components/archive/file-availability";
import { getPresentationDetails } from "@/lib/archive/data";
import { archiveReturnPath, type ArchiveQuery } from "@/lib/archive/filters";
import { formatPresentationDate } from "@/lib/schedule/dates";

export const metadata: Metadata = { title: "Presentation" };

export default async function PresentationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ArchiveQuery>;
}) {
  const { id } = await params;
  const { presentation, canEdit } = await getPresentationDetails(id);
  const query = await searchParams;
  const backToArchive =
    presentation.status === "completed" || Boolean(query.returnTo);
  const backHref = backToArchive
    ? archiveReturnPath(query.returnTo)
    : "/schedule";
  const statusLabel = {
    upcoming: "Upcoming",
    completed: "Completed",
    cancelled: "Cancelled",
  }[presentation.status];
  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-8">
        <ButtonLink href={backHref} variant="secondary">
          {backToArchive ? "Back to archive" : "Back to schedule"}
        </ButtonLink>
      </div>
      <header className="mb-8">
        <p className="eyebrow mb-3">{statusLabel} presentation</p>
        <h1 className="wrap-anywhere text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {presentation.title}
        </h1>
      </header>
      <section
        aria-label="Presentation information"
        className="panel p-6 sm:p-8"
      >
        <dl className="grid min-w-0 gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
              Presenter
            </dt>
            <dd className="mt-2 wrap-anywhere text-sm font-medium">
              {presentation.presenterName}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
              Presentation date
            </dt>
            <dd className="mt-2 text-sm font-medium">
              <time dateTime={presentation.date}>
                {formatPresentationDate(presentation.date)}
              </time>
              <span className="mt-1 block text-muted">
                Slot {presentation.slotNumber} · Vancouver time
              </span>
            </dd>
          </div>
          {presentation.category && (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
                Category
              </dt>
              <dd className="mt-2 wrap-anywhere text-sm font-medium text-brand">
                {presentation.category}
              </dd>
            </div>
          )}
        </dl>
        {presentation.description && (
          <div className="mt-8 border-t border-line pt-6">
            <h2 className="text-lg font-semibold">About this presentation</h2>
            <p className="mt-3 text-base leading-8 whitespace-pre-wrap wrap-anywhere text-muted">
              {presentation.description}
            </p>
          </div>
        )}
        {presentation.referenceUrl && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold">Reference</h2>
            <a
              href={presentation.referenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center rounded text-sm leading-7 wrap-anywhere text-brand hover:underline"
            >
              {presentation.referenceUrl}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        )}
        {presentation.status === "cancelled" && (
          <p className="mt-6 text-sm leading-7 text-muted">
            This presentation was cancelled. Its record has been retained and is
            excluded from the schedule and completed archive.
          </p>
        )}
        {canEdit && (
          <ButtonLink
            href={{ pathname: `/presentations/${id}/edit` }}
            variant="secondary"
            className="mt-6"
          >
            Edit presentation
          </ButtonLink>
        )}
      </section>
      <section
        aria-labelledby="files-heading"
        className="panel mt-6 p-6 sm:p-8"
      >
        <h2 id="files-heading" className="mb-4 text-lg font-semibold">
          Presentation files
        </h2>
        <FileAvailability
          hasPowerPoint={presentation.hasPowerPoint}
          hasPdf={presentation.hasPdf}
        />
        {(presentation.hasPowerPoint || presentation.hasPdf) && (
          <p className="mt-3 text-sm leading-7 text-muted">
            Preview and download access are not available yet.
          </p>
        )}
      </section>
    </article>
  );
}
