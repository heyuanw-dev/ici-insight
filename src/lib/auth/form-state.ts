export type AuthFormState = {
  status?: "error" | "success";
  message?: string;
  email?: string;
  errors?: Partial<Record<"email" | "password" | "confirmPassword", string>>;
};

export const initialAuthFormState: AuthFormState = {};

export function emailFrom(form: FormData): string | null {
  const value = form.get("email");
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

export function passwordFrom(form: FormData): string | null {
  const value = form.get("password");
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    ? value
    : null;
}

export function passwordErrors(form: FormData): AuthFormState["errors"] {
  const password = passwordFrom(form);
  if (
    !password ||
    password.length < 8 ||
    new TextEncoder().encode(password).length > 72
  ) {
    return {
      password:
        "Use at least 8 characters. If your password is very long, try a shorter one.",
    };
  }
  if (form.get("confirmPassword") !== password)
    return { confirmPassword: "The passwords do not match." };
  return undefined;
}
