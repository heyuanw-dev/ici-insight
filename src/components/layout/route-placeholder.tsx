import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";

export function RoutePlaceholder({
  title,
  description,
  message,
  icon = "file",
}: {
  title: string;
  description: string;
  message: string;
  icon?: IconName;
}) {
  return (
    <>
      <PageHeader
        eyebrow="ICI AI Insight Hub"
        title={title}
        description={description}
      />
      <section className="panel">
        <EmptyState
          icon={icon}
          title="This space is getting ready"
          description={message}
        >
          <ButtonLink href="/schedule" variant="secondary">
            <Icon name="back" />
            Back to schedule
          </ButtonLink>
        </EmptyState>
      </section>
    </>
  );
}
