import { ButtonLink } from "@/components/ui/button-link";
import { Icon } from "@/components/ui/icon";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="eyebrow mb-4">Page not found</p>
      <h1 className="text-4xl font-semibold tracking-tight">
        Let’s get you back on track.
      </h1>
      <p className="my-6 text-muted">
        This page may have moved, or the address may be incorrect.
      </p>
      <ButtonLink href="/">
        <Icon name="back" />
        Back to home
      </ButtonLink>
    </div>
  );
}
