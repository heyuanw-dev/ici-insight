import { isUuid } from "@/lib/auth/redirects";
import { siteConfig } from "@/lib/config";

export type RegistrationValues = {
  title: string;
  categoryId: string;
  description: string;
  referenceUrl: string;
};
export type RegistrationState = {
  values: RegistrationValues;
  errors?: Partial<Record<keyof RegistrationValues | "slot", string>>;
  message?: string;
};
export const emptyRegistration: RegistrationState = {
  values: { title: "", categoryId: "", description: "", referenceUrl: "" },
};

export function referenceUrl(value: string): string | null {
  if (!value.trim()) return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed) || /[\s\\]/u.test(trimmed))
    throw new Error("invalid_reference_url");
  const url = new URL(trimmed);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  )
    throw new Error("invalid_reference_url");
  return url.href;
}

export function validateRegistration(form: FormData) {
  const string = (name: string) =>
    typeof form.get(name) === "string" ? (form.get(name) as string).trim() : "";
  const slotId = string("slotId");
  const values: RegistrationValues = {
    title: string("title"),
    categoryId: string("categoryId"),
    description: string("description"),
    referenceUrl: string("referenceUrl"),
  };
  const errors: NonNullable<RegistrationState["errors"]> = {};
  if (!isUuid(slotId))
    errors.slot = "Choose an available slot from the schedule.";
  if (!values.title) errors.title = "Enter a presentation title.";
  if (values.categoryId && !isUuid(values.categoryId))
    errors.categoryId = "Choose a category from the list.";
  if (Array.from(values.description).length > siteConfig.descriptionMaxLength)
    errors.description = "Keep the description to 500 characters or fewer.";
  let url: string | null = null;
  try {
    url = referenceUrl(values.referenceUrl);
  } catch {
    errors.referenceUrl =
      "Enter a complete http:// or https:// URL without spaces or sign-in credentials.";
  }
  return {
    values,
    errors,
    slotId,
    url,
    valid: Object.keys(errors).length === 0,
  };
}

export function bookingError(
  message: string,
  code?: string,
): Pick<RegistrationState, "errors" | "message"> {
  if (code === "23505" || message === "slot_booked")
    return {
      errors: {
        slot: "This slot has just been booked. Choose another available slot.",
      },
    };
  const slots: Record<string, string> = {
    slot_closed: "This slot is now closed. Choose another available slot.",
    slot_past:
      "This date has passed in Vancouver. Choose a current or future slot.",
    slot_not_found: "This slot is no longer available. Choose another slot.",
  };
  if (slots[message]) return { errors: { slot: slots[message] } };
  if (message === "category_unavailable")
    return {
      errors: {
        categoryId:
          "This category is no longer available. Choose another category or leave it blank.",
      },
    };
  if (message === "title_required")
    return { errors: { title: "Enter a presentation title." } };
  if (message === "description_too_long")
    return {
      errors: {
        description: "Keep the description to 500 characters or fewer.",
      },
    };
  if (message === "invalid_reference_url")
    return {
      errors: { referenceUrl: "Enter a complete http:// or https:// URL." },
    };
  if (code === "42501")
    return {
      message:
        "Your workspace access could not be verified. Sign in again or contact your administrator.",
    };
  return {
    message:
      "We couldn’t confirm the booking. Check the schedule before trying again; your draft is still here.",
  };
}
