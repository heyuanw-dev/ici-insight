import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RegistrationForm } from "@/components/schedule/registration-form";
import { getRegistrationSlot } from "@/lib/schedule/data";
import { formatPresentationDate } from "@/lib/schedule/dates";
import { requireEmployee } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Volunteer to present" };
export default async function NewPresentationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireEmployee();
  const { slot: id } = await searchParams;
  const selection =
    typeof id === "string" ? await getRegistrationSlot(id) : null;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Bring a new perspective"
        title="Volunteer to present"
        description="Choose a topic you’d like to share. A title is all you need to get started."
      />
      {!selection ? (
        <div className="panel">
          <EmptyState
            icon="calendar"
            title={id ? "Slot unavailable" : "Choose a presentation slot"}
            description={
              id
                ? "We couldn’t find that slot. Choose an available date and slot from the schedule."
                : "Start with an available date and slot on the presentation schedule."
            }
          >
            <ButtonLink href="/schedule">View schedule</ButtonLink>
          </EmptyState>
        </div>
      ) : (
        <>
          <section
            aria-label="Selected presentation slot"
            className="panel mb-6 p-6"
          >
            <dl className="grid gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Presentation date and slot
                </dt>
                <dd className="mt-2 text-sm font-medium">
                  <time dateTime={selection.slot.date}>
                    {formatPresentationDate(selection.slot.date)}
                  </time>
                  <span className="mt-1 block text-muted">
                    Slot {selection.slot.number} · Vancouver time
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Presenter
                </dt>
                <dd className="mt-2 wrap-anywhere text-sm font-medium">
                  {selection.employee.name}
                  <span className="mt-1 block text-muted">
                    You’re registering yourself.
                  </span>
                </dd>
              </div>
            </dl>
          </section>
          {selection.unavailable ? (
            <div className="panel">
              <EmptyState
                icon="calendar"
                title="Slot unavailable"
                description={selection.unavailable}
              >
                <ButtonLink href="/schedule">Choose another slot</ButtonLink>
              </EmptyState>
            </div>
          ) : (
            <section
              aria-label="Register your presentation"
              className="panel p-6 sm:p-8"
            >
              <RegistrationForm
                slotId={selection.slot.id}
                categories={selection.categories}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
