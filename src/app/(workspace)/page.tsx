import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";

export default function HomePage() {
  return (
    <div className="space-y-12 sm:space-y-16">
      <section
        className="grid items-center gap-10 lg:grid-cols-[1fr_320px] lg:gap-16"
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
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/schedule">
              View upcoming presentations
              <Icon name="arrow" className="size-4" />
            </ButtonLink>
            <ButtonLink href="/archive" variant="secondary">
              Browse presentation archive
            </ButtonLink>
          </div>
        </div>
        <aside
          className="panel overflow-hidden"
          aria-labelledby="weekly-heading"
        >
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <h2 id="weekly-heading" className="text-sm font-semibold">
              Our weekly conversation
            </h2>
            <Icon name="calendar" className="size-5 text-brand" />
          </div>
          <div className="px-6 py-7">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
              Make room for a new idea
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-tight">
              Tuesday<span className="text-brand">.</span>
            </p>
            <p className="mt-4 text-sm leading-7 text-muted">
              A paper worth reading. A tool worth trying. A perspective worth
              sharing.
            </p>
            <div className="mt-7 flex items-center gap-2.5 border-t border-line pt-5 text-xs text-muted">
              <Icon name="clock" className="size-4" />
              Scheduled in Vancouver time
            </div>
          </div>
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
        <div className="panel">
          <EmptyState
            icon="calendar"
            title="The next conversation starts here"
            description="Upcoming presentations and opportunities to share will appear here. There are no presentations to display yet."
          />
        </div>
      </section>

      <section
        className="flex flex-col items-start justify-between gap-6 border-t border-line pt-10 sm:flex-row sm:items-center"
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
