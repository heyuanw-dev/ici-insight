import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Presentation archive" };

export default function ArchivePage() {
  return (
    <>
      <PageHeader
        eyebrow="The conversations continue"
        title="Presentation archive"
        description="Revisit the research, tools, and perspectives shared by the team. A growing collection of our collective knowledge."
      />
      <section className="panel" aria-label="Presentation archive">
        <div className="border-b border-line px-6 py-5 text-sm font-semibold">
          Past presentations
        </div>
        <EmptyState
          icon="book"
          title="A home for what we learn"
          description="Past presentations and their slides will be collected here. There are no archived presentations to display yet."
        >
          <ButtonLink href="/schedule" variant="secondary">
            Explore the schedule
          </ButtonLink>
        </EmptyState>
      </section>
    </>
  );
}
