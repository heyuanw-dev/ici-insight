import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getAuthSnapshot } from "@/lib/auth/session";
import { safeReturnPath } from "@/lib/auth/redirects";

export const metadata: Metadata = { title: "Sign in" };
const notices: Record<string, string> = {
  access:
    "Your account does not have workspace access. Contact your administrator.",
  unavailable:
    "We could not check your access. Please try signing in again shortly.",
  "password-updated":
    "Your password has been updated. Sign in with your new password.",
  "invalid-link":
    "This link is invalid or has expired. Request a new reset link, or contact your administrator.",
};
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const auth = await getAuthSnapshot();
  const next = safeReturnPath(query.next);
  if (auth.kind === "authenticated")
    redirect(
      auth.employee.password_setup_required ? "/account/password" : next,
    );
  const recovery = query.mode === "recovery";
  const notice =
    typeof query.notice === "string" ? notices[query.notice] : undefined;
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8">
        <p className="eyebrow mb-3">For the ICI Lab team</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {recovery ? "Reset your password" : "Welcome to Insight Hub"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {recovery
            ? "Enter your work email and we’ll send a link to reset your password."
            : "Sign in with your employee account to access the team workspace."}
        </p>
      </div>
      <section
        aria-label={recovery ? "Password recovery" : "Sign in"}
        className="panel p-6 sm:p-8"
      >
        {notice && (
          <p
            role="status"
            className="mb-5 rounded-lg border border-line bg-canvas p-4 text-sm leading-6"
          >
            {notice}
          </p>
        )}
        {auth.kind === "unconfigured" ? (
          <p className="text-sm leading-6 text-muted">
            Sign-in is temporarily unavailable. Contact your workspace
            administrator.
          </p>
        ) : (
          <AuthForm mode={recovery ? "recovery" : "signin"} next={next} />
        )}
      </section>
      <p className="mt-6 text-sm leading-6 text-muted">
        Accounts are provided by your workspace administrator. Contact them if
        you need access.
      </p>
    </div>
  );
}
