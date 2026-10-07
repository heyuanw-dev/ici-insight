import { isUuid, safeReturnPath } from "@/lib/auth/redirects";

export const archivePageSize = 12;
export const archiveSearchLimit = 200;
export type ArchiveQuery = Record<string, string | string[] | undefined>;
export type ArchiveFilters = {
  q: string;
  presenter: string;
  category: string;
  year: string;
  from: string;
  to: string;
};
export type ArchiveErrors = Partial<Record<keyof ArchiveFilters, string>>;
export type FilterOption = { value: string; label: string };
export type ArchiveOptions = Record<
  "presenter" | "category" | "year",
  FilterOption[]
>;

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function parseArchiveFilters(query: ArchiveQuery) {
  const errors: ArchiveErrors = {};
  const read = (key: keyof ArchiveFilters) => {
    const value = query[key];
    if (Array.isArray(value)) errors[key] = "Choose one value for this field.";
    return typeof value === "string" ? value.trim() : "";
  };
  const filters: ArchiveFilters = {
    q: read("q").replace(/\s+/gu, " "),
    presenter: read("presenter").toLowerCase(),
    category: read("category").toLowerCase(),
    year: read("year"),
    from: read("from"),
    to: read("to"),
  };
  if (Array.from(filters.q).length > archiveSearchLimit)
    errors.q = "Keep your search to 200 characters or fewer.";
  for (const key of ["presenter", "category"] as const)
    if (filters[key] && !isUuid(filters[key]))
      errors[key] = `Choose a valid ${key}.`;
  if (
    filters.year &&
    (!/^\d{1,4}$/.test(filters.year) || Number(filters.year) < 1)
  )
    errors.year = "Choose a valid year.";
  for (const key of ["from", "to"] as const)
    if (filters[key] && !isCalendarDate(filters[key]))
      errors[key] = "Enter a valid date in YYYY-MM-DD format.";
  if (
    !errors.from &&
    !errors.to &&
    filters.from &&
    filters.to &&
    filters.from > filters.to
  )
    errors.to = "The end date must be on or after the start date.";
  const page =
    typeof query.page === "string" && /^[1-9]\d{0,5}$/.test(query.page)
      ? Number(query.page)
      : 1;
  return {
    filters,
    errors,
    valid: Object.keys(errors).length === 0,
    page,
    hasFilters: Object.values(filters).some(Boolean),
  };
}

export function archiveHref(
  filters: ArchiveFilters,
  page = 1,
): "/archive" | `/archive?${string}` {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value) params.set(key, value);
  if (page > 1) params.set("page", String(page));
  return params.size ? `/archive?${params}` : "/archive";
}

export function archiveReturnPath(value: unknown) {
  const safe = safeReturnPath(value);
  return new URL(safe, "https://workspace.invalid").pathname === "/archive"
    ? safe
    : "/archive";
}
