import Link from "next/link";
import type { ComponentProps } from "react";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary";
};

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ButtonLinkProps) {
  const color =
    variant === "primary"
      ? "border-brand bg-brand text-white hover:border-brand-hover hover:bg-brand-hover"
      : "border-line bg-surface text-ink hover:border-ink/30 hover:bg-canvas";

  return (
    <Link
      className={`inline-flex min-h-11 items-center justify-center gap-3 rounded-lg border px-5 py-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${color} ${className}`}
      {...props}
    />
  );
}
