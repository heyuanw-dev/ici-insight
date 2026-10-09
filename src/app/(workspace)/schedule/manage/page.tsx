import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import {
  CreateSlotForm,
  ExtendScheduleForm,
  CloseDateForm,
  ReopenDateForm,
  UpdateSlotForm,
} from "@/components/admin/schedule-forms";
import {
  presentationInputClass,
  adminButtonClass,
} from "@/components/ui/form-styles";
import { getAdminSchedule } from "@/lib/admin/data";
import { formatPresentationDate } from "@/lib/schedule/dates";

export const metadata: Metadata = { title: "Manage schedule" };

export default async function ManageSchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const data = await getAdminSchedule(query.start);
  const notices: Record<string, string> = {
    create: "Slot added. Date closures still apply.",
    update: "Slot updated. Date closures still apply.",
    close: "Date closed, including slots added later.",
    reopen: "Date reopened. Individually closed slots remain closed.",
    extend:
      "Weekly schedule extended. Existing slots, bookings and closures were preserved.",
    deleted:
      "Presentation deleted. Its record and files have been retained and are hidden from the application.",
  };
  const notice =
    typeof query.notice === "string" ? notices[query.notice] : undefined;
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Manage schedule"
        description="Add dates and slots, extend the weekly schedule, and close dates for holidays. All dates use Vancouver time."
      >
        <ButtonLink href="/schedule" variant="secondary">
          Back to schedule
        </ButtonLink>
      </PageHeader>
      {notice && (
        <p
          role="status"
          className="mb-8 rounded-xl border border-brand/25 bg-brand-soft p-5 text-sm leading-7"
        >
          {notice}
          {query.notice === "extend" &&
          typeof query.added === "string" &&
          /^\d{1,2}$/.test(query.added)
            ? ` ${query.added} slots added.`
            : ""}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <section
          className="panel space-y-5 p-6"
          aria-labelledby="add-slot-heading"
        >
          <h2 id="add-slot-heading" className="text-lg font-semibold">
            Add a presentation slot
          </h2>
          <p className="text-sm leading-7 text-muted">
            Choose any date, including past dates for historical corrections.
            Add more slots on the same day when needed.
          </p>
          <CreateSlotForm date={data.start} />
        </section>
        <section
          className="panel space-y-5 p-6"
          aria-labelledby="extend-heading"
        >
          <h2 id="extend-heading" className="text-lg font-semibold">
            Extend weekly schedule
          </h2>
          <p className="text-sm leading-7 text-muted">
            Add one slot on each Tuesday that has no slots yet. Existing
            bookings and closures stay in place. Extend up to 366 days at a
            time.
          </p>
          <ExtendScheduleForm
            key={data.extensionStart}
            start={data.extensionStart}
            end={data.extensionEnd}
            today={data.today}
          />
        </section>
        <section
          className="panel space-y-5 p-6"
          aria-labelledby="close-heading"
        >
          <h2 id="close-heading" className="text-lg font-semibold">
            Close a date
          </h2>
          <p className="text-sm leading-7 text-muted">
            Reschedule or cancel all presentations on a date before closing it.
            You can close a holiday before any slots exist.
          </p>
          <CloseDateForm date={data.start} />
        </section>
      </div>
      <section
        className="mt-10 space-y-6"
        aria-labelledby="manage-slots-heading"
      >
        <div className="border-b border-line pb-6">
          <h2 id="manage-slots-heading" className="text-xl font-semibold">
            Dates and slots
          </h2>
          <p className="mt-2 text-sm leading-7 text-muted">
            Showing 12 weeks from {formatPresentationDate(data.start, true)} to{" "}
            {formatPresentationDate(data.end, true)}. Choose a past date to
            manage historical slots.
          </p>
          <form
            action="/schedule/manage"
            className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-end"
          >
            <div>
              <label
                htmlFor="manage-start"
                className="mb-2 block text-sm font-medium"
              >
                Show dates from
              </label>
              <input
                id="manage-start"
                name="start"
                type="date"
                defaultValue={data.start}
                required
                min="0001-01-01"
                max="9999-12-31"
                className={presentationInputClass}
              />
            </div>
            <button className={adminButtonClass}>Show dates</button>
          </form>
        </div>
        {data.closures.length > 0 && (
          <section className="panel p-6" aria-labelledby="closed-dates-heading">
            <h3 id="closed-dates-heading" className="text-lg font-semibold">
              Closed dates
            </h3>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {data.closures.map((date) => (
                <div
                  key={date}
                  className="space-y-3 rounded-lg border border-line p-4"
                >
                  <p className="text-sm font-semibold">
                    <time dateTime={date}>{formatPresentationDate(date)}</time>
                  </p>
                  <ReopenDateForm date={date} />
                </div>
              ))}
            </div>
          </section>
        )}
        <p className="text-sm leading-7 text-muted">
          To change the date of a presentation, use its editor. Slots with
          presentation history keep their original date and number. Closing a
          booked slot requires rescheduling or cancelling its presentation
          first.
        </p>
        {data.slots.length === 0 ? (
          <p className="panel p-6 text-sm text-muted">
            No slots in this date range.
          </p>
        ) : (
          <div className="grid items-start gap-6 md:grid-cols-2">
            {data.slots.map((slot) => {
              const booking = data.bookings.find((b) => b.slot_id === slot.id);
              return (
                <section
                  key={`${slot.id}-${slot.revision}`}
                  className="panel space-y-5 p-6"
                  aria-label={`Slot ${slot.slot_number} on ${slot.presentation_date}`}
                >
                  <h3 className="text-base font-semibold">
                    {formatPresentationDate(slot.presentation_date)} · Slot{" "}
                    {slot.slot_number}
                  </h3>
                  {booking?.presentation_id ? (
                    <div className="space-y-3 text-sm leading-7">
                      <p className="wrap-anywhere">
                        Booked: {booking.title} · {booking.presenter_name}
                      </p>
                      <ButtonLink
                        href={{
                          pathname: `/presentations/${booking.presentation_id}/edit`,
                        }}
                        variant="secondary"
                      >
                        Edit presentation
                      </ButtonLink>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      {!slot.is_open ||
                      data.closures.includes(slot.presentation_date)
                        ? "Closed"
                        : slot.presentation_date < data.today
                          ? "Past, unbooked slot"
                          : "Available"}
                    </p>
                  )}
                  <UpdateSlotForm
                    slot={slot}
                    dateClosed={data.closures.includes(slot.presentation_date)}
                  />
                </section>
              );
            })}
          </div>
        )}
        {data.cancelled.length > 0 && (
          <section
            className="panel space-y-4 p-6"
            aria-labelledby="cancelled-heading"
          >
            <h3 id="cancelled-heading" className="text-lg font-semibold">
              Cancelled presentations in this date range
            </h3>
            <p className="text-sm leading-7 text-muted">
              Retained records can be corrected or deleted. Editing a cancelled
              presentation does not restore its booking.
            </p>
            <ul className="divide-y divide-line">
              {data.cancelled.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                >
                  <p className="wrap-anywhere text-sm leading-7">
                    {p.title} ·{" "}
                    {p.presentation_date &&
                      formatPresentationDate(p.presentation_date, true)}{" "}
                    · Slot {p.slot_number}
                  </p>
                  <ButtonLink
                    href={{ pathname: `/presentations/${p.id}/edit` }}
                    variant="secondary"
                  >
                    Edit presentation
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </>
  );
}
