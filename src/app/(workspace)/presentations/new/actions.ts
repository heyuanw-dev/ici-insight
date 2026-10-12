"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  bookingError,
  validateRegistration,
  type RegistrationState,
  type RegistrationResult,
} from "@/lib/schedule/registration";

async function bookPresentation(form: FormData): Promise<RegistrationResult> {
  await requireEmployee();
  const input = validateRegistration(form);
  if (!input.valid) return { values: input.values, errors: input.errors };
  let id: string;
  try {
    const client = await createSupabaseServerClient(true);
    const { data, error } = await client.rpc("register_presentation", {
      p_slot_id: input.slotId,
      p_title: input.values.title,
      p_category_id: input.values.categoryId || undefined,
      p_description: input.values.description || undefined,
      p_reference_url: input.url || undefined,
    });
    if (error || !data)
      return {
        values: input.values,
        ...bookingError(error?.message ?? "", error?.code),
      };
    id = data;
  } catch {
    return { values: input.values, ...bookingError("") };
  }
  return { values: input.values, presentationId: id };
}

export async function registerPresentation(
  _previous: RegistrationState,
  form: FormData,
): Promise<RegistrationState> {
  const result = await bookPresentation(form);
  if (!result.presentationId) return result;
  revalidatePath("/");
  revalidatePath("/schedule");
  revalidatePath("/presentations/new");
  redirect(
    `/schedule?registered=${result.presentationId}#presentation-${result.presentationId}`,
  );
}

export async function registerWithSlides(
  form: FormData,
): Promise<RegistrationResult> {
  // Keep the registration UI mounted until its direct-to-Storage uploads finish.
  // Revalidating from this action could replace it with "Slot unavailable".
  // A full navigation afterwards reads the uncached schedule and confirmation.
  return bookPresentation(form);
}
