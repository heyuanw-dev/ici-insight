"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateRegistration } from "@/lib/schedule/registration";
import {
  editingError,
  mutationIdentity,
  type EditState,
  type CancellationState,
} from "@/lib/schedule/editing";

function refreshPresentation(id: string) {
  for (const path of [
    "/",
    "/schedule",
    "/presentations/new",
    `/presentations/${id}`,
    `/presentations/${id}/edit`,
  ])
    revalidatePath(path);
}

export async function savePresentation(
  _previous: EditState,
  form: FormData,
): Promise<EditState> {
  await requireEmployee();
  const input = validateRegistration(form);
  const draft = { values: input.values, slotId: input.slotId };
  const identity = mutationIdentity(form);
  if (!identity)
    return {
      ...draft,
      message: "Reload this presentation before trying again.",
    };
  if (!input.valid) return { ...draft, errors: input.errors };
  try {
    const client = await createSupabaseServerClient(true);
    const { data, error } = await client.rpc("update_presentation", {
      p_id: identity.id,
      p_revision: identity.revision,
      p_slot_id: input.slotId,
      p_title: input.values.title,
      p_category_id: input.values.categoryId || undefined,
      p_description: input.values.description || undefined,
      p_reference_url: input.url || undefined,
    });
    if (error || !data)
      return { ...draft, ...editingError(error?.message ?? "", error?.code) };
  } catch {
    return { ...draft, ...editingError("") };
  }
  refreshPresentation(identity.id);
  redirect(`/schedule?updated=${identity.id}#presentation-${identity.id}`);
}

export async function cancelPresentation(
  _previous: CancellationState,
  form: FormData,
): Promise<CancellationState> {
  await requireEmployee();
  const identity = mutationIdentity(form);
  if (!identity)
    return { message: "Reload this presentation before trying again." };
  if (form.get("confirm") !== "yes")
    return { message: "Confirm that you want to cancel this presentation." };
  try {
    const client = await createSupabaseServerClient(true);
    const { data, error } = await client.rpc("cancel_presentation", {
      p_id: identity.id,
      p_revision: identity.revision,
      p_confirm: true,
    });
    if (error || !data)
      return {
        message:
          editingError(error?.message ?? "", error?.code).message ??
          "The cancellation could not be confirmed. Check the schedule before retrying.",
      };
  } catch {
    return { message: editingError("").message };
  }
  refreshPresentation(identity.id);
  redirect(`/schedule?cancelled=${identity.id}`);
}
