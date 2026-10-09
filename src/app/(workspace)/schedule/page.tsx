import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { SlotCard } from "@/components/schedule/slot-card";
import { getSchedule, type ScheduleSlot } from "@/lib/schedule/data";
import { addCalendarDays, formatPresentationDate } from "@/lib/schedule/dates";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const noticeKind = query.cancelled
    ? "cancelled"
    : query.updated
      ? "updated"
      : "registered";
  const schedule = await getSchedule(query.page, query[noticeKind], noticeKind);
  const groups = new Map<string, ScheduleSlot[]>();
  for (const slot of schedule.slots)
    groups.set(slot.date, [...(groups.get(slot.date) ?? []), slot]);
  return (
    <>
      <PageHeader
        eyebrow="A new perspective, every week"
        title="Presentation schedule"
        description="See what’s coming up and find a moment to share something with the team."
      >
        <div className="flex flex-wrap items-center gap-4">
          {schedule.isAdmin && (
            <ButtonLink href="/schedule/manage" variant="secondary">
              Manage schedule
            </ButtonLink>
          )}
          <span className="inline-flex shrink-0 items-center gap-2 text-sm text-muted">
            <Icon name="clock" className="size-4" />
            Vancouver time
          </span>
        </div>
      </PageHeader>
      {schedule.confirmation && (
        <div
          role="status"
          className="mb-8 rounded-xl border border-brand/25 bg-brand-soft p-5"
        >
          <p className="font-semibold">
            {schedule.confirmation.kind === "cancelled"
              ? "Presentation cancelled."
              : schedule.confirmation.kind === "updated"
                ? "Presentation updated."
                : "Your presentation is scheduled."}
          </p>
          <p className="mt-2 wrap-anywhere text-sm leading-7">
            {schedule.confirmation.title} ·{" "}
            {formatPresentationDate(schedule.confirmation.date)} · Slot{" "}
            {schedule.confirmation.number}
          </p>
          {schedule.confirmation.kind === "cancelled" && (
            <p className="mt-2 text-sm leading-7">
              The record and any files have been retained. The slot is available
              for booking if it is still open, current or future, and has not
              been booked again.
            </p>
          )}
        </div>
      )}
      <section aria-label="Presentation schedule">
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">
              {schedule.page === 0 ? "Next 12 weeks" : "Later presentations"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              <time dateTime={schedule.start}>
                {formatPresentationDate(schedule.start, true)}
              </time>{" "}
              –{" "}
              <time dateTime={addCalendarDays(schedule.end, -1)}>
                {formatPresentationDate(
                  addCalendarDays(schedule.end, -1),
                  true,
                )}
              </time>
            </p>
          </div>
          <nav aria-label="Schedule dates" className="flex flex-wrap gap-2">
            {schedule.page > 0 && (
              <ButtonLink
                href={
                  schedule.page === 1
                    ? "/schedule"
                    : `/schedule?page=${schedule.page - 1}`
                }
                variant="secondary"
              >
                Previous 12 weeks
              </ButtonLink>
            )}
            {schedule.hasNext && (
              <ButtonLink
                href={`/schedule?page=${schedule.page + 1}`}
                variant="secondary"
              >
                Next 12 weeks
              </ButtonLink>
            )}
          </nav>
        </div>
        {groups.size ? (
          <div className="space-y-10">
            {[...groups].map(([date, slots]) => (
              <section key={date} aria-label={formatPresentationDate(date)}>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold">
                    <time dateTime={date}>{formatPresentationDate(date)}</time>
                  </h2>
                  {date === schedule.today && (
                    <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
                      Today
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    {slots.length} {slots.length === 1 ? "slot" : "slots"}
                  </span>
                </div>
                <div className="grid items-start gap-4 md:grid-cols-2">
                  {slots.map((slot) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      employeeId={schedule.employeeId}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="panel">
            <EmptyState
              icon="calendar"
              title="No slots in this date range"
              description={
                schedule.hasNext
                  ? "Check the next date range for more presentation slots."
                  : "There are no presentation slots in this date range. Your workspace administrator can add dates to the schedule."
              }
            />
          </div>
        )}
      </section>
    </>
  );
}
