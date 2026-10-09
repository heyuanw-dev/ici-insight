import "server-only";
import { requireEmployee } from "@/lib/auth/session";
import { isUuid } from "@/lib/auth/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  schedulePageForDate,
  scheduleWindow,
  vancouverToday,
} from "@/lib/schedule/dates";
import type { Database } from "@/types/database";

type ScheduleRow = Database["public"]["Views"]["schedule_slots"]["Row"];
export type ScheduleSlot = {
  id: string;
  date: string;
  number: number;
  isOpen: boolean;
  presentation: null | {
    id: string;
    title: string;
    presenterId: string;
    presenterName: string;
    description: string | null;
    category: string | null;
    referenceUrl: string | null;
  };
};

function slotFrom(row: ScheduleRow): ScheduleSlot {
  if (
    !row.slot_id ||
    !row.presentation_date ||
    row.slot_number === null ||
    row.is_open === null
  )
    throw new Error("The schedule could not be loaded.");
  let presentation: ScheduleSlot["presentation"] = null;
  if (row.presentation_id) {
    if (!row.title || !row.presenter_name || !row.presenter_user_id)
      throw new Error("The presentation could not be loaded.");
    presentation = {
      id: row.presentation_id,
      title: row.title,
      presenterId: row.presenter_user_id,
      presenterName: row.presenter_name,
      description: row.description,
      category: row.category_name,
      referenceUrl: row.reference_url,
    };
  }
  return {
    id: row.slot_id,
    date: row.presentation_date,
    number: row.slot_number,
    isOpen: row.is_open,
    presentation,
  };
}

export async function getSchedule(
  requestedPage: unknown,
  noticeId: unknown,
  noticeKind: "registered" | "updated" | "cancelled" = "registered",
) {
  const employee = await requireEmployee();
  const client = await createSupabaseServerClient();
  const today = vancouverToday();
  const latest = await client
    .from("presentation_slots")
    .select("presentation_date")
    .gte("presentation_date", today)
    .order("presentation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new Error("The schedule could not be loaded.");
  let confirmation: {
    id: string;
    title: string;
    date: string;
    number: number;
    kind: typeof noticeKind;
  } | null = null;
  if (typeof noticeId === "string" && isUuid(noticeId)) {
    let query = client
      .from("presentation_overview")
      .select("id, title, presentation_date, slot_number")
      .eq("id", noticeId)
      .eq("status", noticeKind === "cancelled" ? "cancelled" : "upcoming");
    if (employee.role !== "admin")
      query = query.eq("presenter_user_id", employee.id);
    const result = await query.maybeSingle();
    if (result.error)
      throw new Error("The presentation confirmation could not be loaded.");
    const row = result.data;
    if (
      row?.id &&
      row.title &&
      row.presentation_date &&
      row.slot_number !== null
    )
      confirmation = {
        id: row.id,
        title: row.title,
        date: row.presentation_date,
        number: row.slot_number,
        kind: noticeKind,
      };
  }
  const page =
    requestedPage ??
    (confirmation
      ? String(schedulePageForDate(confirmation.date, today))
      : undefined);
  const window = scheduleWindow(
    today,
    page,
    latest.data?.presentation_date ?? null,
  );
  const slots: ScheduleSlot[] = [];
  // Honor PostgREST's row limit even if administrators add many slots per date.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("schedule_slots")
      .select("*")
      .gte("presentation_date", window.start)
      .lt("presentation_date", window.end)
      .order("presentation_date")
      .order("slot_number")
      .range(offset, offset + 999);
    if (error) throw new Error("The schedule could not be loaded.");
    slots.push(...data.map(slotFrom));
    if (data.length < 1000) break;
  }
  return {
    ...window,
    today,
    slots,
    confirmation,
    employeeId: employee.id,
    isAdmin: employee.role === "admin",
  };
}

export async function getHomeSchedule() {
  const employee = await requireEmployee();
  const client = await createSupabaseServerClient();
  const today = vancouverToday();
  const [booked, available] = await Promise.all([
    client
      .from("schedule_slots")
      .select("*")
      .gte("presentation_date", today)
      .not("presentation_id", "is", null)
      .order("presentation_date")
      .order("slot_number")
      .limit(5),
    client
      .from("schedule_slots")
      .select("*")
      .gte("presentation_date", today)
      .eq("is_open", true)
      .is("presentation_id", null)
      .order("presentation_date")
      .order("slot_number")
      .limit(1)
      .maybeSingle(),
  ]);
  if (booked.error || available.error)
    throw new Error("Upcoming presentations could not be loaded.");
  let openSlots: ScheduleSlot[] = [];
  if (available.data?.presentation_date) {
    const result = await client
      .from("schedule_slots")
      .select("*")
      .eq("presentation_date", available.data.presentation_date)
      .eq("is_open", true)
      .is("presentation_id", null)
      .order("slot_number")
      .limit(5);
    if (result.error) throw new Error("Available slots could not be loaded.");
    openSlots = result.data.map(slotFrom);
  }
  return {
    booked: booked.data.map(slotFrom),
    openSlots,
    today,
    employeeId: employee.id,
  };
}

export async function getRegistrationSlot(id: string) {
  const employee = await requireEmployee();
  if (!isUuid(id)) return null;
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("schedule_slots")
    .select("*")
    .eq("slot_id", id)
    .maybeSingle();
  if (error) throw new Error("This slot could not be loaded.");
  if (!data) return null;
  const slot = slotFrom(data);
  const today = vancouverToday();
  const unavailable =
    slot.date < today
      ? "This presentation date has passed in Vancouver."
      : !slot.isOpen
        ? "This slot is closed for registration."
        : slot.presentation
          ? "This slot has already been booked."
          : null;
  if (unavailable) return { slot, employee, categories: [], unavailable };
  const categories = await client
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (categories.error)
    throw new Error("Presentation categories could not be loaded.");
  return { slot, employee, categories: categories.data, unavailable };
}
