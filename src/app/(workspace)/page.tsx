import Link from "next/link";
import { SlotCard } from "@/components/schedule/slot-card";
import { getHomeSchedule } from "@/lib/schedule/data";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";

export default async function HomePage() {
  const { booked, openSlots, employeeId } = await getHomeSchedule();
  return (
    <div className="space-y-12 sm:space-y-16">
      <section
        className="grid items-center gap-10 lg:grid-cols-[1fr_380px] lg:gap-16"
        aria-labelledby="welcome-heading"
      >
        <div>
          <p className="eyebrow mb-5">Research. Perspective. Conversation.</p>
          <h1
            id="welcome-heading"
            className="max-w-2xl text-4xl leading-[1.12] font-semibold tracking-[-0.04em] sm:text-5xl lg:text-[56px]"
          >
            AI insight,
            <br />
            <span className="text-brand">shared together.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-muted">
            Discover, share, and revisit the latest in artificial intelligence.
            Every Tuesday, ICI Lab comes together to explore new research,
            technologies, and ideas.
          </p>
          <div className="mt-8 flex flex-col flex-wrap gap-3 sm:flex-row">
            <ButtonLink href="/schedule">
              View upcoming presentations
              <Icon name="arrow" className="size-4" />
            </ButtonLink>
            <ButtonLink href="/archive" variant="secondary">
              Browse presentation archive
            </ButtonLink>
          </div>
        </div>
        <aside aria-labelledby="next-heading">
          <h2 id="next-heading" className="eyebrow mb-4">
            {booked.length
              ? "Next presentation"
              : "The next conversation starts here"}
          </h2>
          {booked[0] ? (
            <SlotCard
              slot={booked[0]}
              employeeId={employeeId}
              showDate
              featured
            />
          ) : (
            <div className="panel p-6">
              <Icon name="calendar" className="mb-4 size-6 text-brand" />
              <p className="text-lg font-semibold">
                No presentations are currently scheduled.
              </p>
              <p className="mt-3 text-sm leading-7 text-muted">
                Be the first to volunteer. A paper worth reading, a tool worth
                trying, or a perspective worth sharing.
              </p>
              <ButtonLink href="/schedule" variant="secondary" className="mt-5">
                Find an available slot
              </ButtonLink>
            </div>
          )}
        </aside>
      </section>

      <section aria-labelledby="upcoming-heading">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow mb-2">On the horizon</p>
            <h2
              id="upcoming-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              Upcoming presentations
            </h2>
          </div>
          <Link
            href="/schedule"
            className="inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-brand hover:underline"
          >
            View schedule
            <Icon name="arrow" className="size-4" />
          </Link>
        </div>
        {booked.length > 1 ? (
          <div className="grid items-start gap-4 md:grid-cols-2">
            {booked.slice(1).map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                employeeId={employeeId}
                showDate
              />
            ))}
          </div>
        ) : (
          <div className="panel">
            <EmptyState
              icon="calendar"
              title={
                booked.length
                  ? "More conversations to come"
                  : "Be the first to volunteer"
              }
              description={
                booked.length
                  ? "Our next presentation is featured above. Find an available slot to add your topic to the schedule."
                  : "No presentations are currently scheduled. Choose an available slot and share something with the team."
              }
            />
          </div>
        )}
      </section>

      <section aria-labelledby="available-heading">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow mb-2">Make room for a new idea</p>
            <h2
              id="available-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              Next opportunity to present
            </h2>
          </div>
          <Link
            href="/schedule"
            className="inline-flex min-h-11 items-center rounded text-sm font-semibold text-brand hover:underline"
          >
            View all slots
          </Link>
        </div>
        {openSlots.length ? (
          <div className="grid items-start gap-4 md:grid-cols-2">
            {openSlots.map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                employeeId={employeeId}
                showDate
              />
            ))}
          </div>
        ) : (
          <div className="panel">
            <EmptyState
              icon="calendar"
              title="No open slots available"
              description="All current and future slots are booked or closed. Check back later or contact your workspace administrator."
            />
          </div>
        )}
      </section>

      <section
        className="flex flex-col flex-wrap items-start justify-between gap-6 border-t border-line pt-10 sm:flex-row sm:items-center"
        aria-labelledby="archive-heading"
      >
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Icon name="book" />
          </span>
          <div>
            <h2 id="archive-heading" className="text-lg font-semibold">
              Good ideas deserve a second look.
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-7 text-muted">
              Our presentation archive will keep the team’s knowledge close at
              hand, long after the conversation ends.
            </p>
          </div>
        </div>
        <ButtonLink href="/archive" variant="secondary" className="shrink-0">
          Explore the archive
          <Icon name="arrow" className="size-4" />
        </ButtonLink>
      </section>
    </div>
  );
}
