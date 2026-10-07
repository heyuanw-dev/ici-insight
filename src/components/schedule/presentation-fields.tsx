"use client";

import { useState } from "react";
import type { RegistrationState } from "@/lib/schedule/registration";

export const presentationInputClass =
  "min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink aria-invalid:border-brand";
const inputClass = presentationInputClass;

export function PresentationFields({
  state,
  categories,
}: {
  state: RegistrationState;
  categories: { id: string; name: string }[];
}) {
  const [values, setValues] = useState(state.values);
  const description = values.description;
  const change = (field: keyof typeof values, value: string) =>
    setValues((previous) => ({ ...previous, [field]: value }));
  const count = Array.from(description).length;
  const errors = state.errors;
  return (
    <>
      <div>
        <label htmlFor="title" className="mb-2 block text-sm font-medium">
          Presentation title <span className="text-muted">(required)</span>
        </label>
        <input
          id="title"
          name="title"
          required
          value={values.title}
          onChange={(e) => change("title", e.target.value)}
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
        <label htmlFor="categoryId" className="mb-2 block text-sm font-medium">
          Category <span className="text-muted">(optional)</span>
        </label>
        <select
          id="categoryId"
          name="categoryId"
          value={values.categoryId}
          onChange={(e) => change("categoryId", e.target.value)}
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
        <label htmlFor="description" className="mb-2 block text-sm font-medium">
          Short description / abstract{" "}
          <span className="text-muted">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          value={description}
          onChange={(e) => change("description", e.target.value)}
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
          value={values.referenceUrl}
          onChange={(e) => change("referenceUrl", e.target.value)}
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
    </>
  );
}
