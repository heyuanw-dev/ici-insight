import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { requireEmployee } from "@/lib/auth/session";
export const metadata: Metadata = { title: "Account password" };
export default async function PasswordPage() {
  const employee = await requireEmployee(true);
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8">
        <p className="eyebrow mb-3">Your account</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {employee.password_setup_required
            ? "Set your password"
            : "Update your password"}
        </h1>
        <p className="mt-3 break-words text-sm leading-6 text-muted">
          Choose a password for {employee.email}.
        </p>
      </div>
      <section className="panel p-6 sm:p-8" aria-label="Password settings">
        <AuthForm mode="password" />
      </section>
    </div>
  );
}
