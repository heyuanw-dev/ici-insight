"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registerPresentation } from "@/app/(workspace)/presentations/new/actions";
import { emptyRegistration } from "@/lib/schedule/registration";

const inputClass =
  "min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink aria-invalid:border-brand";

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
  const [description, setDescription] = useState("");
  const count = Array.from(description).length;
  const errors = state.errors;
  return (
    <form action={action} className="space-y-6">
      {(state.message || (errors && Object.keys(errors).length > 0)) && (
        <div
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
        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-medium">
            Presentation title <span className="text-muted">(required)</span>
          </label>
          <input
            id="title"
            name="title"
            required
            defaultValue={state.values.title}
            aria-invalid={Boolean(errors?.title)}
            aria-describedby={errors?.title ? "title-error" : undefined}
            className={inputClass}
          />
          {errors?.title && (
            <p id="title-error" className="mt-2 text-sm text-brand">
              {errors.title}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="categoryId"
            className="mb-2 block text-sm font-medium"
          >
            Category <span className="text-muted">(optional)</span>
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={state.values.categoryId}
            aria-invalid={Boolean(errors?.categoryId)}
            aria-describedby={errors?.categoryId ? "category-error" : undefined}
            className={inputClass}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors?.categoryId && (
            <p id="category-error" className="mt-2 text-sm text-brand">
              {errors.categoryId}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="description"
            className="mb-2 block text-sm font-medium"
          >
            Short description / abstract{" "}
            <span className="text-muted">(optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={Boolean(errors?.description) || count > 500}
            aria-describedby={`description-hint${errors?.description ? " description-error" : ""}`}
            className={`${inputClass} resize-y`}
          />
          <p
            id="description-hint"
            className={`mt-2 text-sm ${count > 500 ? "text-brand" : "text-muted"}`}
          >
            {count} / 500 characters
          </p>
          {errors?.description && (
            <p id="description-error" className="mt-2 text-sm text-brand">
              {errors.description}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="referenceUrl"
            className="mb-2 block text-sm font-medium"
          >
            Reference URL <span className="text-muted">(optional)</span>
          </label>
          <input
            id="referenceUrl"
            name="referenceUrl"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            defaultValue={state.values.referenceUrl}
            aria-invalid={Boolean(errors?.referenceUrl)}
            aria-describedby={`reference-hint${errors?.referenceUrl ? " reference-error" : ""}`}
            className={inputClass}
            placeholder="https://example.com/research"
          />
          <p id="reference-hint" className="mt-2 text-sm leading-6 text-muted">
            One link to a paper, repository, article, or demo. Use http:// or
            https://.
          </p>
          {errors?.referenceUrl && (
            <p id="reference-error" className="mt-2 text-sm text-brand">
              {errors.referenceUrl}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:gap-6">
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
