"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { isUuid } from "@/lib/auth/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateRegistration } from "@/lib/schedule/registration";
import { mutationIdentity, type EditState } from "@/lib/schedule/editing";
import { adminError, type AdminResult } from "@/lib/admin/validation";

export async function saveAdminPresentation(
  _previous: EditState,
  form: FormData,
): Promise<EditState> {
  await requireAdmin();
  const input = validateRegistration(form),
    identity = mutationIdentity(form);
  const draft = { values: input.values, slotId: input.slotId };
  if (!identity)
    return { ...draft, message: adminError("presentation_changed") };
  if (!input.valid) return { ...draft, errors: input.errors };
  const presenter = form.get("presenterId");
  if (typeof presenter !== "string" || !isUuid(presenter))
    return { ...draft, message: adminError("presenter_unavailable") };
  try {
    const client = await createSupabaseServerClient(true);
    const { data, error } = await client.rpc("admin_update_presentation", {
      p_id: identity.id,
      p_revision: identity.revision,
      p_slot_id: input.slotId,
      p_presenter_id: presenter,
      p_title: input.values.title,
      p_category_id: input.values.categoryId || undefined,
      p_description: input.values.description || undefined,
      p_reference_url: input.url || undefined,
    });
    if (error || !data)
      return {
        ...draft,
        message: adminError(error?.message ?? "", error?.code),
      };
  } catch {
    return { ...draft, message: adminError("") };
  }
  revalidatePath("/", "layout");
  redirect(`/presentations/${identity.id}?notice=updated`);
}

export async function removeAdminPresentation(
  _previous: AdminResult,
  form: FormData,
): Promise<AdminResult> {
  await requireAdmin();
  const identity = mutationIdentity(form),
    operation = form.get("operation");
  if (!identity) return { message: adminError("presentation_changed") };
  if (
    (operation !== "cancel" && operation !== "delete") ||
    form.get("confirm") !== "yes"
  )
    return { message: adminError("confirmation_required") };
  try {
    const client = await createSupabaseServerClient(true);
    const { data, error } = await client.rpc("admin_remove_presentation", {
      p_id: identity.id,
      p_revision: identity.revision,
      p_operation: operation,
      p_confirm: true,
    });
    if (error || !data)
      return { message: adminError(error?.message ?? "", error?.code) };
  } catch {
    return { message: adminError("") };
  }
  revalidatePath("/", "layout");
  redirect(
    operation === "delete"
      ? "/schedule/manage?notice=deleted"
      : `/presentations/${identity.id}?notice=cancelled`,
  );
}
