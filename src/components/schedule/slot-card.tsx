import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { formatPresentationDate } from "@/lib/schedule/dates";
import type { ScheduleSlot } from "@/lib/schedule/data";

export function SlotCard({
  slot,
  employeeId,
  showDate = false,
  featured = false,
}: {
  slot: ScheduleSlot;
  employeeId: string;
  showDate?: boolean;
  featured?: boolean;
}) {
  const presentation = slot.presentation;
  return (
    <article
      id={presentation ? `presentation-${presentation.id}` : `slot-${slot.id}`}
      aria-label={`Slot ${slot.number}${presentation ? `: ${presentation.title}` : ""}`}
      className={`panel min-w-0 scroll-mt-6 p-5 sm:p-6 ${featured ? "border-brand/30" : ""}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-muted">
          Slot {slot.number}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${!slot.isOpen ? "bg-canvas text-muted" : presentation ? "bg-brand-soft text-brand" : "border border-line text-ink"}`}
        >
          {!slot.isOpen
            ? "Closed · Unavailable"
            : presentation
              ? "Booked"
              : "Available"}
        </span>
      </div>
      {showDate && (
        <p className="mb-3 text-sm text-muted">
          <time dateTime={slot.date}>{formatPresentationDate(slot.date)}</time>
        </p>
      )}
      {presentation ? (
        <>
          <h3
            className={`wrap-anywhere font-semibold tracking-tight ${featured ? "text-2xl" : "text-lg"}`}
          >
            <Link
              href={{ pathname: `/presentations/${presentation.id}` }}
              className="rounded hover:text-brand hover:underline"
            >
              {presentation.title}
            </Link>
          </h3>
          <p className="mt-2 wrap-anywhere text-sm text-muted">
            Presented by{" "}
            <span className="font-medium text-ink">
              {presentation.presenterName}
            </span>
            {presentation.presenterId === employeeId && <span> · You</span>}
          </p>
          {presentation.category && (
            <p className="mt-4 text-xs font-medium text-brand">
              {presentation.category}
            </p>
          )}
          {presentation.description && (
            <p className="mt-3 text-sm leading-7 whitespace-pre-wrap wrap-anywhere text-muted">
              {presentation.description}
            </p>
          )}
          {presentation.referenceUrl && (
            <p className="mt-4">
              <a
                href={presentation.referenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded text-sm font-medium text-brand hover:underline"
              >
                View reference{" "}
                <span className="sr-only">
                  for {presentation.title} (opens in a new tab)
                </span>
                <span aria-hidden="true" className="ml-2">
                  ↗
                </span>
              </a>
            </p>
          )}
          {!slot.isOpen && (
            <p className="mt-4 text-sm leading-6 text-muted">
              This presentation is still scheduled. Registration for this slot
              is closed.
            </p>
          )}
          {presentation.presenterId === employeeId && (
            <ButtonLink
              href={{ pathname: `/presentations/${presentation.id}/edit` }}
              variant="secondary"
              className="mt-5 w-full sm:w-auto"
            >
              Edit presentation
            </ButtonLink>
          )}
        </>
      ) : slot.isOpen ? (
        <>
          <h3 className="text-lg font-semibold">Presentation slot available</h3>
          <p className="mt-2 text-sm leading-7 text-muted">
            Share a paper, a demo, or an idea with the team.
          </p>
          <ButtonLink
            href={`/presentations/new?slot=${slot.id}`}
            className="mt-5 w-full sm:w-auto"
          >
            {showDate ? "Volunteer to present" : "Volunteer for this slot"}
          </ButtonLink>
        </>
      ) : (
        <>
          <h3 className="text-lg font-semibold">No registration available</h3>
          <p className="mt-2 text-sm leading-7 text-muted">
            This slot is closed. Please choose another date or slot.
          </p>
        </>
      )}
    </article>
  );
}
