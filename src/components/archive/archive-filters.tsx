import Form from "next/form";
import Link from "next/link";
import {
  archiveSearchLimit,
  type ArchiveErrors,
  type ArchiveFilters as Filters,
  type ArchiveOptions,
} from "@/lib/archive/filters";
import { SearchButton } from "./search-button";

const inputClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink aria-invalid:border-brand";

export function ArchiveFilters({
  filters,
  errors,
  options,
}: {
  filters: Filters;
  errors: ArchiveErrors;
  options: ArchiveOptions;
}) {
  return (
    <Form
      action="/archive"
      className="panel mb-8 p-5 sm:p-6"
      aria-label="Search and filter presentations"
    >
      <fieldset key={JSON.stringify(filters)} className="min-w-0 space-y-5">
        <legend className="sr-only">Search and filters</legend>
        <div>
          <label
            htmlFor="archive-search"
            className="mb-2 block text-sm font-medium"
          >
            Search presentations
          </label>
          <input
            id="archive-search"
            name="q"
            type="search"
            defaultValue={filters.q}
            maxLength={archiveSearchLimit}
            placeholder="Try a topic, presenter, or research idea"
            className={inputClass}
            aria-invalid={Boolean(errors.q)}
            aria-describedby={`search-hint${errors.q ? " q-error" : ""}`}
          />
          <p id="search-hint" className="mt-2 text-sm leading-6 text-muted">
            Search words or parts of words in titles, presenters, descriptions,
            and categories.
          </p>
          {errors.q && (
            <p id="q-error" className="mt-2 text-sm text-brand">
              {errors.q}
            </p>
          )}
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-3">
          {(
            [
              ["presenter", "Presenter"],
              ["category", "Category"],
              ["year", "Year"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="min-w-0">
              <label
                htmlFor={`archive-${key}`}
                className="mb-2 block text-sm font-medium"
              >
                {label}
              </label>
              <select
                id={`archive-${key}`}
                name={key}
                defaultValue={filters[key]}
                className={inputClass}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={errors[key] ? `${key}-error` : undefined}
              >
                <option value="">
                  All {key === "category" ? "categories" : `${key}s`}
                </option>
                {filters[key] &&
                  !options[key].some(
                    (option) => option.value === filters[key],
                  ) && (
                    <option value={filters[key]}>
                      Selection not in archive
                    </option>
                  )}
                {options[key].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors[key] && (
                <p id={`${key}-error`} className="mt-2 text-sm text-brand">
                  {errors[key]}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {(
            [
              ["from", "From date"],
              ["to", "To date"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="min-w-0">
              <label
                htmlFor={`archive-${key}`}
                className="mb-2 block text-sm font-medium"
              >
                {label} <span className="text-muted">(optional)</span>
              </label>
              <input
                id={`archive-${key}`}
                name={key}
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                defaultValue={filters[key]}
                className={inputClass}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={`date-range-hint${errors[key] ? ` ${key}-error` : ""}`}
              />
              {errors[key] && (
                <p id={`${key}-error`} className="mt-2 text-sm text-brand">
                  {errors[key]}
                </p>
              )}
            </div>
          ))}
        </div>
        <p id="date-range-hint" className="text-sm leading-6 text-muted">
          Dates use Vancouver time. Both endpoints are included; filters work
          together.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <SearchButton />
          <Link
            href="/archive"
            className="inline-flex min-h-11 items-center justify-center rounded text-sm font-medium text-muted hover:text-brand"
          >
            Clear search and filters
          </Link>
        </div>
      </fieldset>
    </Form>
  );
}
