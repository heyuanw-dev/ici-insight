import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

type EmptyStateProps = {
  title: string;
  description: string;
  icon: IconName;
  children?: ReactNode;
};

export function EmptyState({
  title,
  description,
  icon,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center sm:py-20">
      <span className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-line bg-canvas text-muted">
        <Icon name={icon} className="size-6" />
      </span>
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-7 text-muted">
        {description}
      </p>
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
