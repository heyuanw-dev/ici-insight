import { isCalendarDate } from "@/lib/archive/filters";
import { editingError } from "@/lib/schedule/editing";

export function dateInput(value: unknown): value is string {
  return typeof value === "string" && isCalendarDate(value);
}

export function positiveInteger(
  value: FormDataEntryValue | null,
  max = 2147483647,
): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= max ? number : null;
}

export type AdminResult = { message?: string; success?: string };

export function adminError(message: string, code?: string): string {
  const messages: Record<string, string> = {
    admin_access_required:
      "Administrator access is required. Reload the page or sign in again.",
    invalid_date: "Enter a valid date.",
    invalid_slot_number: "Enter a slot number between 1 and 32767.",
    invalid_schedule_range:
      "Choose a current or future start date and an end date within 366 days of it.",
    slot_number_taken:
      "That date already has a slot with this number. Choose another number.",
    slot_changed:
      "This slot changed after you opened it. Reload the page before trying again.",
    date_changed:
      "This date’s closure changed. Reload the page before trying again.",
    slot_has_history:
      "This slot has presentation history. Create another slot and reschedule the presentation from its editor instead.",
    slot_has_booking:
      "Reschedule or cancel this slot’s presentation before closing it.",
    date_has_bookings:
      "Reschedule or cancel every presentation on this date before closing it.",
    presenter_unavailable:
      "Choose an existing employee from the presenter list.",
    confirmation_required: "Confirm this action before continuing.",
    invalid_week_day: "Choose a different day in the same Monday–Sunday week.",
    day_move_past:
      "Only current or future presentation dates can be moved. Choose a date that has not passed in Vancouver.",
    day_move_closed:
      "The original or destination date is closed. Reopen it explicitly before changing the presentation day.",
    day_move_changed:
      "The slots or bookings changed after you opened this form. Reload the schedule and review them before trying again.",
    day_move_conflict:
      "The destination already has slots. Choose an empty date, or reschedule presentations individually using their editors.",
  };
  if (messages[message]) return messages[message];
  const error = editingError(message, code);
  return (
    error.message ||
    Object.values(error.errors ?? {})[0] ||
    "Your changes could not be confirmed. Reload the page before trying again."
  );
}
