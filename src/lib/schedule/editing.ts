import { isUuid } from "@/lib/auth/redirects";
import { bookingError, type RegistrationState } from "./registration";

export type EditState = RegistrationState & { slotId: string };
export type CancellationState = { message?: string };

export function mutationIdentity(form: FormData) {
  const id = form.get("presentationId");
  const value = form.get("revision");
  const revision =
    typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : 0;
  if (
    typeof id !== "string" ||
    !isUuid(id) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    revision > 2147483647
  )
    return null;
  return { id, revision };
}

export function editingError(
  message: string,
  code?: string,
): Pick<EditState, "errors" | "message"> {
  const messages: Record<string, string> = {
    presentation_changed:
      "This presentation changed after you opened it. Reload the latest version before making further changes.",
    presentation_unavailable:
      "This presentation is no longer available for you to change.",
    presentation_cancelled:
      "This presentation has already been cancelled. Return to the schedule to make a new booking.",
    presentation_completed:
      "This presentation is now completed in Vancouver. Contact an administrator for metadata changes.",
    cancellation_confirmation_required:
      "Confirm that you want to cancel this presentation.",
  };
  if (messages[message]) return { message: messages[message] };
  if (message === "slot_booked" || code === "23505")
    return {
      errors: {
        slot: "This slot has just been booked. Your original booking is unchanged. Choose another available slot.",
      },
    };
  if (message || code) {
    const known = bookingError(message, code);
    if (known.errors || code === "42501") return known;
  }
  return {
    message:
      "We couldn’t confirm your changes. Check the schedule before retrying.",
  };
}
