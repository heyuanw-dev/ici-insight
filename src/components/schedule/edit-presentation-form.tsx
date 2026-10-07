"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import {
  cancelPresentation,
  savePresentation,
} from "@/app/(workspace)/presentations/[id]/edit/actions";
import { formatPresentationDate } from "@/lib/schedule/dates";
import type { EditState } from "@/lib/schedule/editing";
import {
  PresentationFields,
  presentationInputClass,
} from "./presentation-fields";

export function EditPresentationForm({
  id,
  revision,
  initial,
  currentSlot,
  categories,
  available,
}: {
  id: string;
  revision: number;
  initial: EditState;
  currentSlot: { date: string; number: number; isOpen: boolean };
  categories: { id: string; name: string }[];
  available: { id: string; date: string; number: number }[];
}) {
  const [state, save, saving] = useActionState(savePresentation, initial);
  const [cancellation, cancel, cancelling] = useActionState(
    cancelPresentation,
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const cancellationToggle = useRef<HTMLButtonElement>(null);
  const [slotId, setSlotId] = useState(initial.slotId);
  const pending = saving || cancelling;
  const currentLabel = `${formatPresentationDate(currentSlot.date)} · Slot ${currentSlot.number}`;
  return (
    <div className="space-y-6">
      <form
        action={save}
        // Server Actions return field errors as state. Keep the entire draft;
        // successful saves navigate away instead of resetting this form.
        onReset={(event) => event.preventDefault()}
        className="panel space-y-6 p-6 sm:p-8"
        aria-label="Edit presentation"
      >
        {(state.message || state.errors) && (
          <div
            role="alert"
            className="rounded-lg border border-brand/30 bg-brand-soft p-4 text-sm leading-6 text-brand"
          >
            <p className="font-semibold">
              Your changes have not been confirmed.
            </p>
            <p>
              {state.message ||
                state.errors?.slot ||
                "Check the highlighted fields and try again. Your draft is still below."}
            </p>
            <a
              href={`/presentations/${id}/edit`}
              className="mt-2 inline-flex min-h-11 items-center font-semibold underline"
            >
              Reload latest presentation
            </a>
          </div>
        )}
        <fieldset disabled={pending} className="space-y-6">
          <legend className="sr-only">Presentation information</legend>
          <input type="hidden" name="presentationId" value={id} />
          <input type="hidden" name="revision" value={revision} />
          <div>
            <label htmlFor="slotId" className="mb-2 block text-sm font-medium">
              Presentation date and slot
            </label>
            <select
              id="slotId"
              name="slotId"
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
              className={presentationInputClass}
              aria-invalid={Boolean(state.errors?.slot)}
              aria-describedby={`slot-hint${state.errors?.slot ? " slot-error" : ""}`}
            >
              <option value={initial.slotId}>
                {currentLabel} (current{currentSlot.isOpen ? "" : ", closed"})
              </option>
              {available
                .filter((slot) => slot.id !== initial.slotId)
                .map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {formatPresentationDate(slot.date)} · Slot {slot.number}
                  </option>
                ))}
            </select>
            <p id="slot-hint" className="mt-2 text-sm leading-6 text-muted">
              Vancouver time. Choose another available slot to reschedule. Your
              current booking is kept until the move succeeds.
            </p>
            {state.errors?.slot && (
              <p id="slot-error" className="mt-2 text-sm text-brand">
                {state.errors.slot}
              </p>
            )}
          </div>
          <PresentationFields state={state} categories={categories} />
          <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:gap-6">
            <button
              type="submit"
              aria-busy={saving}
              className="min-h-11 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? "Saving changes…" : "Save changes"}
            </button>
            <Link
              href="/schedule"
              className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-muted hover:text-brand"
            >
              Back to schedule
            </Link>
          </div>
        </fieldset>
      </form>
      <section
        aria-labelledby="cancellation-heading"
        className="panel p-6 sm:p-8"
      >
        <h2 id="cancellation-heading" className="text-lg font-semibold">
          Cancel presentation
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted">
          Cancellation removes this presentation from the upcoming schedule and
          retains its record and any files. An open slot becomes available for
          another presenter.
        </p>
        <button
          ref={cancellationToggle}
          type="button"
          disabled={pending}
          aria-expanded={confirming}
          aria-controls={confirming ? "cancellation-confirmation" : undefined}
          onClick={() => setConfirming(!confirming)}
          className="mt-4 min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-brand disabled:opacity-60"
        >
          {confirming ? "Hide cancellation options" : "Cancel presentation"}
        </button>
        {confirming && (
          <form
            id="cancellation-confirmation"
            action={cancel}
            className="mt-5 space-y-4"
            aria-label="Confirm cancellation"
          >
            {cancellation.message && (
              <p role="alert" className="text-sm leading-6 text-brand">
                {cancellation.message}{" "}
                <a
                  href={`/presentations/${id}/edit`}
                  className="inline-flex min-h-11 items-center underline"
                >
                  Reload latest presentation
                </a>
              </p>
            )}
            <fieldset disabled={pending} className="space-y-4">
              <legend className="sr-only">Cancellation confirmation</legend>
              <input type="hidden" name="presentationId" value={id} />
              <input type="hidden" name="revision" value={revision} />
              <p className="wrap-anywhere text-sm font-medium">
                {initial.values.title} · {currentLabel}
              </p>
              <p className="text-sm text-muted">
                Unsaved edits above will not be saved.
              </p>
              <label className="flex min-h-11 items-center gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  name="confirm"
                  value="yes"
                  required
                  className="size-5 shrink-0 accent-brand"
                />
                I confirm that I want to cancel this presentation.
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  aria-busy={cancelling}
                  className="min-h-11 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
                >
                  {cancelling ? "Cancelling…" : "Confirm cancellation"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    cancellationToggle.current?.focus();
                  }}
                  className="min-h-11 rounded-lg border border-line px-5 py-3 text-sm font-medium"
                >
                  Keep presentation
                </button>
              </div>
            </fieldset>
          </form>
        )}
      </section>
    </div>
  );
}
