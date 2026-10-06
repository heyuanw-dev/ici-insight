"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  confirmEmail,
  requestPasswordReset,
  signIn,
  updatePassword,
} from "@/app/(auth)/actions";
import {
  initialAuthFormState,
  type AuthFormState,
} from "@/lib/auth/form-state";

type Mode = "signin" | "recovery" | "password" | "confirm";
const actions = {
  signin: signIn,
  recovery: requestPasswordReset,
  password: updatePassword,
  confirm: confirmEmail,
};
const labels = {
  signin: "Sign in",
  recovery: "Send reset link",
  password: "Save password",
  confirm: "Continue to password setup",
};

function Field({
  name,
  label,
  type,
  autoComplete,
  error,
  defaultValue,
  minLength,
}: {
  name: "email" | "password" | "confirmPassword";
  label: string;
  type: "email" | "password";
  autoComplete: string;
  error?: string;
  defaultValue?: string;
  minLength?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={type === "email" ? 254 : 1024}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-muted aria-invalid:border-brand disabled:opacity-60"
      />
      {error && (
        <p id={`${name}-error`} className="mt-2 text-sm text-brand">
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthForm({
  mode,
  next = "/",
  tokenHash,
  tokenType,
}: {
  mode: Mode;
  next?: string;
  tokenHash?: string;
  tokenType?: "invite" | "recovery";
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    actions[mode],
    initialAuthFormState,
  );
  return (
    <form action={action} className="space-y-5">
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-lg border p-4 text-sm leading-6 ${state.status === "error" ? "border-brand/30 bg-brand/5 text-brand" : "border-line bg-canvas text-ink"}`}
        >
          {state.message}
        </p>
      )}
      <fieldset disabled={pending} className="space-y-5">
        <legend className="sr-only">{labels[mode]}</legend>
        {mode === "signin" && <input type="hidden" name="next" value={next} />}
        {mode === "confirm" && (
          <>
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={tokenType} />
          </>
        )}
        {(mode === "signin" || mode === "recovery") && (
          <Field
            name="email"
            label="Email address"
            type="email"
            autoComplete="username"
            defaultValue={state.email}
            error={state.errors?.email}
          />
        )}
        {(mode === "signin" || mode === "password") && (
          <Field
            name="password"
            label={mode === "password" ? "New password" : "Password"}
            type="password"
            autoComplete={
              mode === "password" ? "new-password" : "current-password"
            }
            minLength={mode === "password" ? 8 : undefined}
            error={state.errors?.password}
          />
        )}
        {mode === "password" && (
          <>
            <p className="text-sm leading-6 text-muted">
              Use at least 8 characters. Saving your password signs you out so
              you can sign in with your new password.
            </p>
            <Field
              name="confirmPassword"
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              error={state.errors?.confirmPassword}
            />
          </>
        )}
        <button
          type="submit"
          aria-busy={pending}
          className="min-h-11 w-full rounded-lg border border-brand bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Please wait…" : labels[mode]}
        </button>
      </fieldset>
      {mode === "signin" && (
        <Link
          href="/login?mode=recovery"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
        >
          Forgot your password?
        </Link>
      )}
      {mode !== "signin" && (
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
        >
          Back to sign in
        </Link>
      )}
    </form>
  );
}
