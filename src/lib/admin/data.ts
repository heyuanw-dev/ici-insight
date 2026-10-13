import "server-only";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/auth/redirects";
import { addCalendarDays, vancouverToday } from "@/lib/schedule/dates";
import { dateInput } from "./validation";

// Supabase caps responses at 1,000 rows. Read all options, including old slots,
// so historical corrections continue working as the archive grows.
async function allRows<T>(
  fetchPage: (
    offset: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await fetchPage(offset);
    if (result.error || !result.data)
      throw new Error("Administrative details could not be loaded.");
    rows.push(...result.data);
    if (result.data.length < 1000) return rows;
  }
}

export async function getAdminSchedule(requestedStart: unknown) {
  await requireAdmin();
  const client = await createSupabaseServerClient();
  const today = vancouverToday();
  const start = dateInput(requestedStart) ? requestedStart : today;
  const end = start > "9999-10-08" ? "9999-12-31" : addCalendarDays(start, 83);
  const [slots, closures, bookings, cancelled, latest] = await Promise.all([
    allRows((offset) =>
      client
        .from("presentation_slots")
        .select("*")
        .gte("presentation_date", start)
        .lte("presentation_date", end)
        .order("presentation_date")
        .order("slot_number")
        .range(offset, offset + 999),
    ),
    client
      .from("schedule_date_closures")
      .select("presentation_date")
      .gte("presentation_date", start)
      .lte("presentation_date", end)
      .order("presentation_date"),
    allRows((offset) =>
      client
        .from("schedule_slots")
        .select("slot_id, presentation_id, title, presenter_name")
        .gte("presentation_date", start)
        .lte("presentation_date", end)
        .not("presentation_id", "is", null)
        .order("presentation_date")
        .order("slot_number")
        .range(offset, offset + 999),
    ),
    allRows((offset) =>
      client
        .from("presentation_overview")
        .select("id, title, presentation_date, slot_number")
        .eq("status", "cancelled")
        .gte("presentation_date", start)
        .lte("presentation_date", end)
        .order("presentation_date")
        .order("id")
        .range(offset, offset + 999),
    ),
    client
      .from("presentation_slots")
      .select("presentation_date")
      .order("presentation_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (closures.error || latest.error)
    throw new Error("Schedule administration could not be loaded.");
  const lastDate = latest.data?.presentation_date;
  const extensionStart =
    lastDate && lastDate >= today && lastDate < "9999-12-31"
      ? addCalendarDays(lastDate, 1)
      : today;
  const extensionDate = new Date(`${extensionStart}T00:00:00Z`);
  extensionDate.setUTCMonth(extensionDate.getUTCMonth() + 6);
  const extensionEnd =
    extensionDate.getUTCFullYear() > 9999
      ? "9999-12-31"
      : addCalendarDays(extensionDate.toISOString().slice(0, 10), -1);
  return {
    today,
    start,
    end,
    slots,
    closures: closures.data.map((row) => row.presentation_date),
    bookings,
    cancelled,
    movableDates: [...new Set(slots.map((slot) => slot.presentation_date))]
      .filter((date) => date >= today)
      .map((date) => ({
        date,
        slots: slots
          .filter((slot) => slot.presentation_date === date)
          .map((slot) => ({
            id: slot.id,
            revision: slot.revision,
            presentation_id:
              bookings.find((booking) => booking.slot_id === slot.id)
                ?.presentation_id ?? null,
          })),
      })),
    extensionStart,
    extensionEnd,
  };
}

export async function getAdminPresentation(id: string) {
  await requireAdmin();
  if (!isUuid(id)) notFound();
  const client = await createSupabaseServerClient();
  const { data: presentation, error } = await client
    .from("presentations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("This presentation could not be loaded.");
  if (!presentation) notFound();
  const [slots, presenters, categories] = await Promise.all([
    allRows((offset) =>
      client
        .from("schedule_slots")
        .select(
          "slot_id, presentation_date, slot_number, is_open, presentation_id",
        )
        .order("presentation_date", { ascending: false })
        .order("slot_number")
        .range(offset, offset + 999),
    ),
    allRows((offset) =>
      client
        .from("users")
        .select("id, name, is_active")
        .order("name")
        .order("id")
        .range(offset, offset + 999),
    ),
    allRows((offset) =>
      client
        .from("categories")
        .select("id, name, is_active")
        .order("sort_order")
        .order("name")
        .range(offset, offset + 999),
    ),
  ]);
  const available = slots
    .filter(
      (slot) =>
        slot.slot_id === presentation.slot_id ||
        presentation.cancelled_at ||
        (slot.is_open && !slot.presentation_id),
    )
    .flatMap((slot) =>
      slot.slot_id && slot.presentation_date && slot.slot_number !== null
        ? [
            {
              id: slot.slot_id,
              date: slot.presentation_date,
              number: slot.slot_number,
              isOpen: slot.is_open,
            },
          ]
        : [],
    );
  return {
    presentation,
    available,
    presenters: presenters.map((p) => ({
      id: p.id,
      name: p.name + (p.is_active ? "" : " (inactive)"),
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name + (c.is_active ? "" : " (inactive)"),
    })),
  };
}
