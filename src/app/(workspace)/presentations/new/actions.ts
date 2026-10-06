"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  bookingError,
  validateRegistration,
  type RegistrationState,
} from "@/lib/schedule/registration";

export async function registerPresentation(
  _previous: RegistrationState,
  form: FormData,
): Promise<RegistrationState> {
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
  revalidatePath("/");
  revalidatePath("/schedule");
  revalidatePath("/presentations/new");
  redirect(`/schedule?registered=${id}#presentation-${id}`);
}
