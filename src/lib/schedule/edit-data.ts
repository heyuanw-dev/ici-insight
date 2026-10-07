import "server-only";
import { notFound } from "next/navigation";
import { requireEmployee, requirePresentationAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vancouverToday } from "./dates";

export async function getEditPresentation(id: string) {
  await requirePresentationAccess(id, true);
  const employee = await requireEmployee();
  const client = await createSupabaseServerClient();
  const { data: presentation, error } = await client
    .from("presentations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("This presentation could not be loaded.");
  if (!presentation) notFound();
  const [slot, presenter, categories] = await Promise.all([
    client
      .from("presentation_slots")
      .select("*")
      .eq("id", presentation.slot_id)
      .single(),
    client
      .from("users")
      .select("name")
      .eq("id", presentation.presenter_user_id)
      .single(),
    client
      .from("categories")
      .select("id, name, is_active")
      .order("sort_order")
      .order("name"),
  ]);
  if (slot.error || presenter.error || categories.error)
    throw new Error("Presentation details could not be loaded.");
  const today = vancouverToday();
  const unavailable = presentation.cancelled_at
    ? "This presentation has been cancelled."
    : slot.data.presentation_date < today
      ? "This presentation is completed. Historical corrections are not available here."
      : null;
  // The permission RPC uses its own statement snapshot. Recheck the loaded record
  // in case it changed between reads; mutation RPCs always authorize again.
  if (
    employee.role !== "admin" &&
    (presentation.presenter_user_id !== employee.id || unavailable)
  )
    notFound();
  const available: { id: string; date: string; number: number }[] = [];
  if (!unavailable) {
    for (let offset = 0; ; offset += 1000) {
      const result = await client
        .from("schedule_slots")
        .select("slot_id, presentation_date, slot_number")
        .eq("is_open", true)
        .is("presentation_id", null)
        .gte("presentation_date", today)
        .order("presentation_date")
        .order("slot_number")
        .range(offset, offset + 999);
      if (result.error) throw new Error("Available slots could not be loaded.");
      for (const row of result.data) {
        if (row.slot_id && row.presentation_date && row.slot_number !== null)
          available.push({
            id: row.slot_id,
            date: row.presentation_date,
            number: row.slot_number,
          });
      }
      if (result.data.length < 1000) break;
    }
  }
  return {
    presentation,
    slot: slot.data,
    presenter: presenter.data.name,
    available,
    unavailable,
    categories: categories.data
      .filter(
        (category) =>
          category.is_active || category.id === presentation.category_id,
      )
      .map((category) => ({
        id: category.id,
        name:
          category.name + (category.is_active ? "" : " (current, inactive)"),
      })),
  };
}
