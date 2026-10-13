"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/auth/redirects";
import type { Json } from "@/types/database";
import {
  adminError,
  dateInput,
  positiveInteger,
  type AdminResult,
} from "@/lib/admin/validation";

export async function manageSchedule(
  _previous: AdminResult,
  form: FormData,
): Promise<AdminResult> {
  await requireAdmin();
  const date = form.get("date");
  if (!dateInput(date)) return { message: adminError("invalid_date") };
  const operation = form.get("operation");
  let added: number | null = null;
  let resultDate = date;
  try {
    const client = await createSupabaseServerClient(true);
    if (operation === "move") {
      const target = form.get("target");
      if (!dateInput(target))
        return { message: adminError("invalid_week_day") };
      if (form.get("confirm") !== "yes")
        return { message: adminError("confirmation_required") };
      const raw = form.get("slots");
      if (typeof raw !== "string")
        return { message: adminError("day_move_changed") };
      let slots: Json;
      try {
        slots = JSON.parse(raw) as Json;
      } catch {
        return { message: adminError("day_move_changed") };
      }
      const { error } = await client.rpc("admin_move_presentation_day", {
        p_source: date,
        p_target: target,
        p_slots: slots,
        p_confirm: true,
      });
      if (error) return { message: adminError(error.message, error.code) };
      resultDate = target < date ? target : date;
    } else if (operation === "extend") {
      const end = form.get("end");
      if (!dateInput(end))
        return { message: adminError("invalid_schedule_range") };
      const { data, error } = await client.rpc("admin_extend_schedule", {
        p_start: date,
        p_end: end,
      });
      if (error || data === null)
        return { message: adminError(error?.message ?? "", error?.code) };
      added = data;
    } else if (operation === "create") {
      const raw = form.get("number");
      const number = positiveInteger(raw, 32767);
      if (raw !== "" && !number)
        return { message: adminError("invalid_slot_number") };
      const { error } = await client.rpc("admin_create_slot", {
        p_date: date,
        p_number: number ?? undefined,
      });
      if (error) return { message: adminError(error.message, error.code) };
    } else if (operation === "update") {
      const id = form.get("slotId"),
        revision = positiveInteger(form.get("revision")),
        number = positiveInteger(form.get("number"), 32767);
      if (typeof id !== "string" || !isUuid(id) || !revision)
        return { message: adminError("slot_changed") };
      if (!number) return { message: adminError("invalid_slot_number") };
      const { error } = await client.rpc("admin_update_slot", {
        p_id: id,
        p_revision: revision,
        p_date: date,
        p_number: number,
        p_open: form.get("open") === "yes",
      });
      if (error) return { message: adminError(error.message, error.code) };
    } else if (operation === "close" || operation === "reopen") {
      if (form.get("confirm") !== "yes")
        return { message: adminError("confirmation_required") };
      const { error } = await client.rpc("admin_set_date_closed", {
        p_date: date,
        p_closed: operation === "close",
        p_expected_closed: operation === "reopen",
      });
      if (error) return { message: adminError(error.message, error.code) };
    } else return { message: "Choose a schedule action." };
  } catch {
    return { message: adminError("") };
  }
  revalidatePath("/", "layout");
  redirect(
    `/schedule/manage?start=${resultDate}&notice=${operation}${added === null ? "" : `&added=${added}`}`,
  );
}
