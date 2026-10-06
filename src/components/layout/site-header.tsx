import Link from "next/link";
import { Navigation } from "@/components/layout/navigation";
import { getAuthSnapshot } from "@/lib/auth/session";
import { signOut } from "@/app/(auth)/actions";
import { siteConfig } from "@/lib/config";

export async function SiteHeader() {
  const auth = await getAuthSnapshot();
  const employee = auth.kind === "authenticated" ? auth.employee : null;
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
        {employee && !employee.password_setup_required && (
          <div className="order-3 flex w-full justify-center border-t border-line pt-3 lg:order-0 lg:w-auto lg:border-0 lg:pt-0">
            <Navigation />
          </div>
        )}
        {employee && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Link
              href="/account/password"
              className="flex min-h-11 max-w-44 flex-col justify-center rounded-md hover:text-brand"
            >
              <span className="truncate font-medium">{employee.name}</span>
              <span className="text-xs text-muted">
                {employee.role === "admin"
                  ? "Administrator"
                  : "Account settings"}
              </span>
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="min-h-11 rounded-md px-2 font-medium text-muted hover:text-brand"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
