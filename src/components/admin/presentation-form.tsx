"use client";

import { useActionState, useRef, useState } from "react";
import { useFormFeedback } from "@/components/ui/use-form-feedback";
import {
  saveAdminPresentation,
  removeAdminPresentation,
} from "@/app/(workspace)/presentations/[id]/edit/admin-actions";
import {
  PresentationFields,
  presentationInputClass,
} from "@/components/schedule/presentation-fields";
import { ButtonLink } from "@/components/ui/button-link";
import { formatPresentationDate } from "@/lib/schedule/dates";
import type { EditState } from "@/lib/schedule/editing";
import type { AdminResult } from "@/lib/admin/validation";
import { adminButtonClass } from "@/components/ui/form-styles";

export function AdminPresentationForm({
  id,
  revision,
  initial,
  presenterId,
  cancelled,
  presenters,
  categories,
  slots,
}: {
  id: string;
  revision: number;
  initial: EditState;
  presenterId: string;
  cancelled: boolean;
  presenters: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  slots: { id: string; date: string; number: number; isOpen: boolean | null }[];
}) {
  const [state, save, saving] = useActionState(saveAdminPresentation, initial);
  const [removal, remove, removing] = useActionState<AdminResult, FormData>(
    removeAdminPresentation,
    {},
  );
  const [slotId, setSlotId] = useState(initial.slotId);
  const [presenter, setPresenter] = useState(presenterId);
  const [operation, setOperation] = useState<"cancel" | "delete" | null>(null);
  const pending = saving || removing;
  const form = useFormFeedback(
    state,
    !pending && Boolean(state.message || state.errors),
  );
  const removalForm = useFormFeedback(
    removal,
    !pending && Boolean(removal.message),
  );
  const cancelToggle = useRef<HTMLButtonElement>(null);
  const deleteToggle = useRef<HTMLButtonElement>(null);
  const keepPresentation = () => {
    setOperation(null);
    (operation === "cancel" ? cancelToggle : deleteToggle).current?.focus();
  };
  const reload = (
    <a
      href={`/presentations/${id}/edit`}
      className="inline-flex min-h-11 items-center font-semibold underline"
    >
      Reload latest presentation
    </a>
  );
  const identity = (
    <>
      <input type="hidden" name="presentationId" value={id} />
      <input type="hidden" name="revision" value={revision} />
    </>
  );
  return (
    <div className="space-y-6">
      <form
        ref={form}
        action={save}
        onReset={(event) => event.preventDefault()}
        aria-label="Admin edit presentation"
        className="panel space-y-6 p-6 sm:p-8"
      >
        {(state.message || state.errors) && (
          <div
            data-form-feedback
            tabIndex={-1}
            role="alert"
            className="rounded-lg border border-brand/30 bg-brand-soft p-4 text-sm leading-7 text-brand"
          >
            <p>
              {state.message ||
                state.errors?.slot ||
                "Check the highlighted fields. Your changes have not been saved."}
            </p>
            {reload}
          </div>
        )}
        <fieldset disabled={pending} className="space-y-6">
          <legend className="sr-only">Presentation information</legend>
          {identity}
          <div>
            <label
              htmlFor="presenterId"
              className="mb-2 block text-sm font-medium"
            >
              Presenter
            </label>
            <select
              id="presenterId"
              name="presenterId"
              value={presenter}
              onChange={(e) => setPresenter(e.target.value)}
              className={presentationInputClass}
            >
              {presenters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
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
              aria-describedby={`admin-slot-hint${state.errors?.slot ? " admin-slot-error" : ""}`}
            >
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatPresentationDate(s.date)} · Slot {s.number}
                  {s.id === initial.slotId ? " (current)" : ""}
                  {s.isOpen ? "" : " (closed)"}
                </option>
              ))}
            </select>
            <p
              id="admin-slot-hint"
              className="mt-2 text-sm leading-7 text-muted"
            >
              Historical dates are available for corrections.{" "}
              {cancelled
                ? "This record is cancelled; changing its date will not reserve a slot or restore the presentation."
                : "Moving to another date reserves that slot and frees the previous one. The presentation’s status follows its date in Vancouver."}
            </p>
            {state.errors?.slot && (
              <p id="admin-slot-error" className="mt-2 text-sm text-brand">
                {state.errors.slot}
              </p>
            )}
            <ButtonLink
              href="/schedule/manage"
              variant="secondary"
              className="mt-3"
            >
              Manage dates and slots
            </ButtonLink>
          </div>
          <PresentationFields state={state} categories={categories} />
          <div className="flex flex-col flex-wrap gap-3 border-t border-line pt-6 sm:flex-row">
            <button
              type="submit"
              aria-busy={saving}
              className={adminButtonClass}
            >
              {saving ? "Saving changes…" : "Save changes"}
            </button>
            <ButtonLink
              href={{ pathname: `/presentations/${id}` }}
              variant="secondary"
            >
              Back to presentation
            </ButtonLink>
          </div>
        </fieldset>
      </form>
      <section
        className="panel space-y-4 p-6 sm:p-8"
        aria-labelledby="admin-remove-heading"
      >
        <h2 id="admin-remove-heading" className="text-lg font-semibold">
          {cancelled ? "Delete presentation" : "Cancel or delete presentation"}
        </h2>
        <p className="text-sm leading-7 text-muted">
          Cancellation retains a visible record and releases its booking.
          Deletion hides the record and file access throughout the application.
          Both retain uploaded files and leave closed or past slots unavailable
          for booking.
        </p>
        <div className="flex flex-wrap gap-3">
          {!cancelled && (
            <button
              ref={cancelToggle}
              type="button"
              disabled={pending}
              onClick={() => setOperation("cancel")}
              aria-expanded={operation === "cancel"}
              aria-controls={
                operation === "cancel" ? "admin-remove-confirmation" : undefined
              }
              className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-brand"
            >
              Cancel presentation
            </button>
          )}
          <button
            ref={deleteToggle}
            type="button"
            disabled={pending}
            onClick={() => setOperation("delete")}
            aria-expanded={operation === "delete"}
            aria-controls={
              operation === "delete" ? "admin-remove-confirmation" : undefined
            }
            className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-brand"
          >
            Delete presentation
          </button>
        </div>
        {operation && (
          <form
            ref={removalForm}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !pending) {
                event.preventDefault();
                keepPresentation();
              }
            }}
            key={operation}
            id="admin-remove-confirmation"
            action={remove}
            aria-label={
              operation === "cancel"
                ? "Confirm cancellation"
                : "Confirm deletion"
            }
            className="space-y-4 border-t border-line pt-5"
          >
            {removal.message && (
              <p
                role="alert"
                data-form-feedback
                tabIndex={-1}
                className="text-sm leading-7 text-brand"
              >
                {removal.message} {reload}
              </p>
            )}
            <fieldset disabled={pending} className="space-y-4">
              <legend className="sr-only">
                Confirm {operation === "delete" ? "deletion" : "cancellation"}
              </legend>
              {identity}
              <input type="hidden" name="operation" value={operation} />
              <p className="wrap-anywhere text-sm font-semibold">
                {initial.values.title}
              </p>
              <p className="text-sm leading-7 text-muted">
                Unsaved edits above will not be saved.
                {operation === "delete" &&
                  " The retained record and files cannot be restored through this application."}
              </p>
              <label className="flex min-h-11 items-center gap-3 text-sm leading-7">
                <input
                  type="checkbox"
                  name="confirm"
                  value="yes"
                  required
                  className="size-5 shrink-0 accent-brand"
                />
                I confirm that I want to {operation} this presentation.
              </label>
              <button
                type="submit"
                aria-busy={removing}
                className={adminButtonClass}
              >
                {removing
                  ? "Saving…"
                  : operation === "cancel"
                    ? "Confirm cancellation"
                    : "Confirm deletion"}
              </button>
              <button
                type="button"
                onClick={keepPresentation}
                className="ml-3 min-h-11 rounded-lg border border-line px-4 py-3 text-sm font-medium"
              >
                Keep presentation
              </button>
            </fieldset>
          </form>
        )}
      </section>
    </div>
  );
}
