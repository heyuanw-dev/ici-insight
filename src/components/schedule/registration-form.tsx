"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormFeedback } from "@/components/ui/use-form-feedback";
import { registerPresentation } from "@/app/(workspace)/presentations/new/actions";
import { emptyRegistration } from "@/lib/schedule/registration";

import { PresentationFields } from "./presentation-fields";

export function RegistrationForm({
  slotId,
  categories,
}: {
  slotId: string;
  categories: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(
    registerPresentation,
    emptyRegistration,
  );
  const errors = state.errors;
  const form = useFormFeedback(
    state,
    !pending && Boolean(state.message || errors),
  );
  return (
    <form
      ref={form}
      action={action}
      onReset={(event) => event.preventDefault()}
      className="space-y-6"
    >
      {(state.message || (errors && Object.keys(errors).length > 0)) && (
        <div
          data-form-feedback
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-brand/30 bg-brand-soft p-4 text-sm leading-6 text-brand"
        >
          <p className="font-semibold">
            Your presentation has not been confirmed.
          </p>
          <p>
            {state.message ||
              errors?.slot ||
              "Check the highlighted fields and try again. Your draft is still below."}
          </p>
          {errors?.slot && (
            <Link
              href="/schedule"
              className="mt-2 inline-flex min-h-11 items-center font-semibold underline"
            >
              Choose another slot
            </Link>
          )}
        </div>
      )}
      <fieldset disabled={pending} className="space-y-6">
        <legend className="sr-only">Presentation information</legend>
        <input type="hidden" name="slotId" value={slotId} />
        <PresentationFields state={state} categories={categories} />
        <div className="flex flex-col flex-wrap gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:gap-6">
          <button
            type="submit"
            aria-busy={pending}
            className="min-h-11 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "Booking your slot…" : "Confirm registration"}
          </button>
          <Link
            href="/schedule"
            className="inline-flex min-h-11 items-center justify-center rounded text-sm font-medium text-muted hover:text-brand"
          >
            Back to schedule
          </Link>
        </div>
      </fieldset>
    </form>
  );
}
