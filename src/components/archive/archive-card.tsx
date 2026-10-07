import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { FileAvailability } from "./file-availability";
import { formatPresentationDate } from "@/lib/schedule/dates";
import type { PresentationDetails } from "@/lib/archive/data";

export function ArchiveCard({
  presentation,
  returnTo,
}: {
  presentation: PresentationDetails;
  returnTo: string;
}) {
  return (
    <article
      aria-labelledby={`archive-title-${presentation.id}`}
      className="panel flex min-w-0 flex-col p-5 sm:p-6"
    >
      <p className="mb-4 text-xs font-medium leading-6 text-muted">
        <time dateTime={presentation.date}>
          {formatPresentationDate(presentation.date, true)}
        </time>{" "}
        · Slot {presentation.slotNumber}
      </p>
      <h3
        id={`archive-title-${presentation.id}`}
        className="wrap-anywhere text-xl leading-7 font-semibold tracking-tight"
      >
        <Link
          href={{
            pathname: `/presentations/${presentation.id}`,
            query: { returnTo },
          }}
          className="rounded hover:text-brand hover:underline"
        >
          {presentation.title}
        </Link>
      </h3>
      <p className="mt-3 wrap-anywhere text-sm text-muted">
        Presented by{" "}
        <span className="font-medium text-ink">
          {presentation.presenterName}
        </span>
      </p>
      {presentation.category && (
        <p className="mt-4 wrap-anywhere text-xs font-medium text-brand">
          {presentation.category}
        </p>
      )}
      {presentation.description && (
        <p className="mt-3 line-clamp-3 text-sm leading-7 whitespace-pre-wrap wrap-anywhere text-muted">
          {presentation.description}
        </p>
      )}
      <div className="mt-auto pt-6">
        <div className="border-t border-line pt-4">
          <FileAvailability
            hasPowerPoint={presentation.hasPowerPoint}
            hasPdf={presentation.hasPdf}
          />
        </div>
      </div>
      <Link
        href={{
          pathname: `/presentations/${presentation.id}`,
          query: { returnTo },
        }}
        className="mt-4 inline-flex min-h-11 items-center gap-2 self-start rounded text-sm font-semibold text-brand hover:underline"
      >
        View presentation<span className="sr-only">: {presentation.title}</span>
        <Icon name="arrow" className="size-4" />
      </Link>
    </article>
  );
}
