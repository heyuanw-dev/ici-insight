import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return (
    <>
      <PageHeader
        eyebrow="A new perspective, every week"
        title="Presentation schedule"
        description="See what’s coming up and find a moment to share something with the team."
      >
        <span className="inline-flex shrink-0 items-center gap-2 text-sm text-muted">
          <Icon name="clock" className="size-4" />
          Vancouver time
        </span>
      </PageHeader>
      <section className="panel" aria-label="Presentation schedule">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5">
          <p className="text-sm font-semibold">Weekly presentations</p>
          <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-muted">
            Tuesdays at ICI Lab
          </span>
        </div>
        <EmptyState
          icon="calendar"
          title="A space for the next big idea"
          description="Presentation dates, available slots, and the team’s upcoming topics will appear here. Registration is not available in this preview."
        />
      </section>
      <p className="mt-5 text-sm leading-7 text-muted">
        Have a paper, a demo, or a new perspective in mind? There’s always
        something worth sharing.
      </p>
    </>
  );
}
