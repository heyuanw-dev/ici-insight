import Link from "next/link";
import { Navigation } from "@/components/layout/navigation";
import { Icon } from "@/components/ui/icon";
import { siteConfig } from "@/lib/config";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="page-container flex min-h-24 flex-wrap items-center justify-between gap-x-5 gap-y-4 py-5 lg:py-0">
        <Link
          href="/"
          aria-label={`${siteConfig.name} home`}
          className="flex items-center gap-3.5 rounded-md"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold tracking-wide text-white">
            ICI
          </span>
          <span>
            <span className="block text-lg font-semibold tracking-tight text-ink">
              {siteConfig.shortName}
            </span>
            <span className="mt-0.5 block text-[10px] font-semibold tracking-[0.17em] text-muted">
              AI INSIGHT · ICI LAB
            </span>
          </span>
        </Link>
        <div className="order-3 flex w-full justify-center border-t border-line pt-3 lg:order-0 lg:w-auto lg:border-0 lg:pt-0">
          <Navigation />
        </div>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted hover:text-brand"
        >
          <Icon name="lock" className="size-4" />
          Sign in
        </Link>
      </div>
    </header>
  );
}
