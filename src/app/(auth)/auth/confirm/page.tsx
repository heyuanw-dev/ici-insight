import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { isEmailToken } from "@/lib/auth/redirects";
export const metadata: Metadata = { title: "Confirm account access" };
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token_hash: token, type } = await searchParams;
  const valid =
    isEmailToken(token) && (type === "invite" || type === "recovery");
  return (
    <div className="mx-auto max-w-md">
      <p className="eyebrow mb-3">ICI Lab account</p>
      <h1 className="mb-4 text-3xl font-semibold tracking-tight">
        {type === "invite" ? "You’re invited" : "Reset your password"}
      </h1>
      <p className="mb-8 text-sm leading-6 text-muted">
        {valid
          ? "Continue to confirm your email link and choose a password for your account."
          : "This link is invalid. Request a new reset link, or ask your administrator for a new invitation."}
      </p>
      <section className="panel p-6 sm:p-8" aria-label="Confirm email link">
        {valid ? (
          <AuthForm mode="confirm" tokenHash={token} tokenType={type} />
        ) : (
          <Link
            href="/login?mode=recovery"
            className="font-medium text-brand hover:underline"
          >
            Request a new reset link
          </Link>
        )}
      </section>
    </div>
  );
}
