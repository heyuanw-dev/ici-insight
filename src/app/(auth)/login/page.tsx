import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-8 text-center">
        <p className="eyebrow mb-3">For the ICI Lab team</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to Insight Hub
        </h1>
      </div>
      <section className="panel">
        <EmptyState
          icon="lock"
          title="Sign-in is coming soon"
          description="This workspace will be available by invitation. Sign-in is not enabled in this preview, and no credentials are collected."
        >
          <ButtonLink href="/" variant="secondary">
            Back to home
          </ButtonLink>
        </EmptyState>
      </section>
    </div>
  );
}
