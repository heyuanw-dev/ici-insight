"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { useFormFeedback } from "@/components/ui/use-form-feedback";
import {
  registerPresentation,
  registerWithSlides,
} from "@/app/(workspace)/presentations/new/actions";
import {
  emptyRegistration,
  validateRegistration,
  type RegistrationResult,
} from "@/lib/schedule/registration";
import {
  fileTypes,
  formatFileSize,
  validateFileInput,
  type FileKind,
} from "@/lib/files/config";
import { uploadSlide } from "@/lib/files/upload";
import { PresentationFields } from "./presentation-fields";

type FormState = RegistrationResult & {
  fileErrors?: Partial<Record<FileKind, string>>;
  savedFiles?: Partial<Record<FileKind, string>>;
  complete?: boolean;
};
const kinds = ["powerpoint", "pdf"] as const;
const scheduleHref = (id: string) =>
  `/schedule?registered=${id}#presentation-${id}`;

export function RegistrationForm({
  slotId,
  categories,
  maxBytes,
}: {
  slotId: string;
  categories: { id: string; name: string }[];
  maxBytes: number | null;
}) {
  const fileInputs = useRef<Partial<Record<FileKind, HTMLInputElement | null>>>(
    {},
  );
  const [upload, setUpload] = useState<{
    kind: FileKind;
    stage: string;
    progress: number;
  } | null>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (previous, metadata) => {
      if (previous.complete) return previous;
      // File inputs deliberately have no name: file bytes never enter a Server
      // Action request (and its small body limit), even before client validation.
      const selected = kinds.flatMap((kind) => {
        const file = fileInputs.current[kind]?.files?.[0];
        return file && !previous.savedFiles?.[kind] ? [{ kind, file }] : [];
      });
      const values = previous.presentationId
        ? previous.values
        : validateRegistration(metadata).values;
      const fileErrors: FormState["fileErrors"] = {};
      for (const { kind, file } of selected) {
        const error = maxBytes
          ? validateFileInput(kind, file.name, file.size, file.type, maxBytes)
          : "Uploads are temporarily unavailable. You can add slides later.";
        if (error) fileErrors[kind] = error;
      }
      if (Object.keys(fileErrors).length)
        return {
          ...previous,
          values,
          errors: undefined,
          message: undefined,
          fileErrors,
        };
      if (!previous.presentationId && selected.length === 0)
        return registerPresentation(previous, metadata);

      let result: RegistrationResult = previous;
      if (!result.presentationId) {
        try {
          result = await registerWithSlides(metadata);
        } catch {
          return {
            values,
            message:
              "We couldn’t confirm the booking. Check the schedule before trying again; your draft is still here.",
          };
        }
        if (!result.presentationId) return result;
      }
      const id = result.presentationId;
      const savedFiles = { ...previous.savedFiles };
      for (const { kind, file } of selected) {
        setUpload({ kind, stage: "Preparing upload…", progress: 0 });
        try {
          await uploadSlide({
            id,
            kind,
            file,
            onStage: (stage) =>
              setUpload((current) => current && { ...current, stage }),
            onProgress: (progress) =>
              setUpload((current) => current && { ...current, progress }),
          });
          savedFiles[kind] = file.name;
        } catch (error) {
          fileErrors[kind] =
            error instanceof Error
              ? error.message
              : "The upload failed. Please retry.";
        }
      }
      setUpload(null);
      if (Object.keys(fileErrors).length)
        return {
          values: result.values,
          presentationId: id,
          savedFiles,
          fileErrors,
        };
      // Read the newly booked schedule afresh, including any already-prefetched
      // pages, without remounting this form while its uploads are in progress.
      window.location.assign(scheduleHref(id));
      return {
        values: result.values,
        presentationId: id,
        savedFiles,
        complete: true,
      };
    },
    emptyRegistration,
  );
  const hasError = Boolean(state.message || state.errors || state.fileErrors);
  const form = useFormFeedback(state, !pending && hasError);
  const disabled = pending || Boolean(state.complete);

  return (
    <form
      ref={form}
      action={action}
      onReset={(event) => event.preventDefault()}
      className="space-y-6"
    >
      {hasError && (
        <div
          data-form-feedback
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-brand/30 bg-brand-soft p-4 text-sm leading-6 text-brand"
        >
          <p className="font-semibold">
            {state.presentationId
              ? "Your presentation is scheduled. Some slides could not be saved."
              : "Your presentation has not been confirmed."}
          </p>
          <p>
            {state.message ||
              state.errors?.slot ||
              (state.presentationId
                ? "Retry the remaining uploads, or continue and add them later. Files already saved are kept."
                : "Check the highlighted fields and try again. Your draft is still below.")}
          </p>
          {state.errors?.slot && (
            <Link
              href="/schedule"
              className="mt-2 inline-flex min-h-11 items-center font-semibold underline"
            >
              Choose another slot
            </Link>
          )}
          {state.presentationId && (
            <a
              href={`/presentations/${state.presentationId}`}
              className="mt-2 inline-flex min-h-11 items-center font-semibold underline"
            >
              View presentation and saved slides
            </a>
          )}
        </div>
      )}
      <fieldset
        disabled={disabled || Boolean(state.presentationId)}
        className="space-y-6"
      >
        <legend className="sr-only">Presentation information</legend>
        <input type="hidden" name="slotId" value={slotId} />
        <PresentationFields state={state} categories={categories} />
      </fieldset>
      <fieldset
        disabled={disabled || !maxBytes}
        className="space-y-4 border-t border-line pt-6"
        aria-describedby="registration-slides-hint"
      >
        <legend className="text-lg font-semibold">
          Presentation slides (optional)
        </legend>
        <p
          id="registration-slides-hint"
          className="text-sm leading-7 text-muted"
        >
          {maxBytes
            ? `Add a PowerPoint and/or PDF preview now, up to ${formatFileSize(maxBytes)} each. You can also upload or replace slides from your presentation page before or after presenting. Your booking is kept if an upload fails.`
            : "Uploads are temporarily unavailable. You can still register and add slides from your presentation page later."}
        </p>
        {maxBytes &&
          kinds.map((kind) => (
            <div key={kind}>
              <label
                htmlFor={`registration-${kind}`}
                className="mb-2 block text-sm font-medium"
              >
                Choose {fileTypes[kind].extension} file (optional)
              </label>
              <input
                ref={(element) => {
                  fileInputs.current[kind] = element;
                }}
                id={`registration-${kind}`}
                type="file"
                accept={`${fileTypes[kind].extension},${fileTypes[kind].mime}`}
                disabled={Boolean(state.savedFiles?.[kind])}
                aria-invalid={Boolean(state.fileErrors?.[kind])}
                aria-describedby={`registration-slides-hint${state.fileErrors?.[kind] ? ` registration-${kind}-error` : ""}${state.savedFiles?.[kind] ? ` registration-${kind}-saved` : ""}`}
                className="block min-h-11 w-full min-w-0 rounded-lg border border-control bg-surface p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-canvas file:px-3 file:py-2 file:font-medium"
              />
              {state.fileErrors?.[kind] && (
                <p
                  id={`registration-${kind}-error`}
                  className="mt-2 text-sm leading-7 text-brand"
                >
                  {state.fileErrors[kind]}
                </p>
              )}
              {state.savedFiles?.[kind] && (
                <p
                  id={`registration-${kind}-saved`}
                  className="mt-2 text-sm leading-7 wrap-anywhere"
                >
                  Saved: {state.savedFiles[kind]}
                </p>
              )}
            </div>
          ))}
      </fieldset>
      {upload && (
        <div role="status" className="space-y-2">
          <p className="text-sm leading-7">
            Your slot is booked. {fileTypes[upload.kind].label}: {upload.stage}
            {upload.stage === "Uploading…" ? ` ${upload.progress}%` : ""}
          </p>
          <progress
            aria-label={`${fileTypes[upload.kind].label} upload progress`}
            value={upload.progress}
            max={100}
            className="h-2 w-full accent-brand"
          />
        </div>
      )}
      <div className="flex flex-col flex-wrap gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:gap-6">
        <button
          type="submit"
          disabled={disabled}
          aria-busy={pending}
          className="min-h-11 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
        >
          {state.complete
            ? "Opening schedule…"
            : pending
              ? upload
                ? "Saving slides…"
                : "Booking your slot…"
              : state.presentationId
                ? "Retry uploads"
                : "Confirm registration"}
        </button>
        {!disabled &&
          (state.presentationId ? (
            <a
              href={scheduleHref(state.presentationId)}
              className="inline-flex min-h-11 items-center justify-center rounded text-sm font-medium text-muted hover:text-brand"
            >
              Continue without remaining slides
            </a>
          ) : (
            <Link
              href="/schedule"
              className="inline-flex min-h-11 items-center justify-center rounded text-sm font-medium text-muted hover:text-brand"
            >
              Back to schedule
            </Link>
          ))}
      </div>
    </form>
  );
}
