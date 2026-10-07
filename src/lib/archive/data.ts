import "server-only";
import { notFound } from "next/navigation";
import { requireEmployee, requirePresentationAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { referenceUrl } from "@/lib/schedule/registration";
import type { Database } from "@/types/database";
import {
  archivePageSize,
  parseArchiveFilters,
  type ArchiveOptions,
  type ArchiveQuery,
} from "./filters";

type OverviewRow = Database["public"]["Views"]["presentation_overview"]["Row"];
export type PresentationDetails = {
  id: string;
  title: string;
  presenterId: string;
  presenterName: string;
  date: string;
  slotNumber: number;
  status: "upcoming" | "completed" | "cancelled";
  category: string | null;
  description: string | null;
  referenceUrl: string | null;
  hasPowerPoint: boolean;
  hasPdf: boolean;
};

function presentationFrom(row: OverviewRow): PresentationDetails {
  if (
    !row.id ||
    !row.title ||
    !row.presenter_user_id ||
    !row.presenter_name ||
    !row.presentation_date ||
    row.slot_number === null ||
    !["upcoming", "completed", "cancelled"].includes(row.status ?? "")
  )
    throw new Error("Presentation information could not be loaded.");
  let url: string | null = null;
  try {
    url = referenceUrl(row.reference_url ?? "");
  } catch {
    /* Do not render an unsafe legacy URL. */
  }
  return {
    id: row.id,
    title: row.title,
    presenterId: row.presenter_user_id,
    presenterName: row.presenter_name,
    date: row.presentation_date,
    slotNumber: row.slot_number,
    status: row.status as PresentationDetails["status"],
    category: row.category_name,
    description: row.description,
    referenceUrl: url,
    hasPowerPoint: Boolean(row.powerpoint_file_id),
    hasPdf: Boolean(row.pdf_file_id),
  };
}

export async function getArchive(query: ArchiveQuery) {
  await requireEmployee();
  const client = await createSupabaseServerClient();
  const input = parseArchiveFilters(query);
  const args = {
    p_query: input.filters.q,
    p_presenter_id: input.filters.presenter || undefined,
    p_category_id: input.filters.category || undefined,
    p_year: input.filters.year ? Number(input.filters.year) : undefined,
    p_date_from: input.filters.from || undefined,
    p_date_to: input.filters.to || undefined,
  };
  const [optionResult, countResult] = await Promise.all([
    client.rpc("archive_filter_options"),
    input.valid
      ? client.rpc("search_archive", args, { head: true, count: "exact" })
      : null,
  ]);
  if (optionResult.error || countResult?.error)
    throw new Error("The presentation archive could not be loaded.");
  const options: ArchiveOptions = { presenter: [], category: [], year: [] };
  for (const option of optionResult.data) {
    if (
      option.filter_type === "presenter" ||
      option.filter_type === "category" ||
      option.filter_type === "year"
    )
      options[option.filter_type].push({
        value: option.value,
        label: option.label,
      });
  }
  for (const key of ["presenter", "category"] as const)
    options[key].sort(
      (a, b) =>
        a.label.localeCompare(b.label) || a.value.localeCompare(b.value),
    );
  options.year.sort((a, b) => Number(b.value) - Number(a.value));
  const total = countResult?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / archivePageSize));
  const page = Math.min(input.page, pages);
  const start = (page - 1) * archivePageSize;
  let items: PresentationDetails[] = [];
  if (input.valid && total) {
    const { data, error } = await client
      .rpc("search_archive", args)
      .order("presentation_date", { ascending: false })
      .order("slot_number")
      .order("id")
      .range(start, start + archivePageSize - 1);
    if (error) throw new Error("The presentation archive could not be loaded.");
    items = data.map(presentationFrom);
  }
  return { ...input, options, items, total, page, pages, start };
}

export async function getPresentationDetails(id: string) {
  const permissions = await requirePresentationAccess(id);
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("presentation_overview")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("This presentation could not be loaded.");
  if (!data) notFound();
  return {
    presentation: presentationFrom(data),
    canEdit: permissions.can_edit_metadata && data.status === "upcoming",
  };
}
