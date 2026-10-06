"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  emailFrom,
  passwordFrom,
  passwordErrors,
  type AuthFormState,
} from "@/lib/auth/form-state";
import { isEmailToken, safeReturnPath } from "@/lib/auth/redirects";
import { loadEmployee, requireEmployee } from "@/lib/auth/session";
import { getSupabaseEnvironment } from "@/lib/supabase/config";
import {
  clearAuthCookies,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

const unavailable: AuthFormState = {
  status: "error",
  message: "Sign-in is temporarily unavailable. Please try again shortly.",
};

export async function signIn(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const email = emailFrom(form);
  const password = passwordFrom(form);
  if (!email || !password)
    return {
      status: "error",
      errors: {
        ...(!email && { email: "Enter a valid email address." }),
        ...(!password && { password: "Enter your password." }),
      },
    };
  let destination = safeReturnPath(form.get("next"));
  try {
    const client = await createSupabaseServerClient(true);
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user)
      return {
        status: "error",
        email,
        message:
          error?.status === 429
            ? "Too many attempts. Please wait a few minutes before trying again."
            : "Unable to sign in. Check your email and password, or contact your workspace administrator.",
      };
    const employee = await loadEmployee(client, data.user);
    if (!employee) {
      await client.auth.signOut({ scope: "local" });
      await clearAuthCookies();
      return {
        status: "error",
        email,
        message:
          "Your account does not have access to this workspace. Contact your administrator.",
      };
    }
    if (employee.password_setup_required) destination = "/account/password";
  } catch {
    return unavailable;
  }
  revalidatePath("/", "layout");
  redirect(destination);
}

export async function requestPasswordReset(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const email = emailFrom(form);
  if (!email)
    return {
      status: "error",
      errors: { email: "Enter a valid email address." },
    };
  try {
    const env = getSupabaseEnvironment();
    if (!env) return unavailable;
    const client = await createSupabaseServerClient(true);
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${env.appUrl}/auth/callback?next=/account/password`,
    });
    if (error && (error.status === 429 || (error.status ?? 0) >= 500))
      return {
        status: "error",
        message:
          "We could not send a reset link right now. Please try again in a few minutes.",
      };
    return {
      status: "success",
      email,
      message:
        "If that address has an account, a password reset link is on its way. Check your inbox.",
    };
  } catch {
    return unavailable;
  }
}

export async function confirmEmail(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const token = form.get("token_hash");
  const type = form.get("type");
  const invalid: AuthFormState = {
    status: "error",
    message:
      "This link is invalid or has expired. Request a new reset link, or ask your administrator for a new invitation.",
  };
  if (!isEmailToken(token) || (type !== "invite" && type !== "recovery"))
    return invalid;
  try {
    const client = await createSupabaseServerClient(true);
    const { data, error } = await client.auth.verifyOtp({
      token_hash: token,
      type,
    });
    if (error || !data.user) return invalid;
    if (!(await loadEmployee(client, data.user))) {
      await client.auth.signOut({ scope: "local" });
      await clearAuthCookies();
      return {
        status: "error",
        message:
          "Your account does not have workspace access. Contact your administrator.",
      };
    }
  } catch {
    return unavailable;
  }
  revalidatePath("/", "layout");
  redirect("/account/password");
}

export async function updatePassword(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  await requireEmployee(true);
  const errors = passwordErrors(form);
  if (errors) return { status: "error", errors };
  try {
    const client = await createSupabaseServerClient(true);
    const { error } = await client.auth.updateUser({
      password: passwordFrom(form)!,
    });
    if (error)
      return {
        status: "error",
        message:
          "The password could not be updated. Try a different password, or request a new reset link.",
      };
    // Revoke refresh tokens on all devices after a password change.
    const { error: signOutError } = await client.auth.signOut({
      scope: "global",
    });
    await clearAuthCookies();
    if (signOutError)
      return {
        status: "success",
        message:
          "Your password was updated. Sign in again. Other sessions could not be signed out; contact your administrator if needed.",
      };
  } catch {
    return {
      status: "error",
      message: "We could not complete the password update. Please try again.",
    };
  }
  revalidatePath("/", "layout");
  redirect("/login?notice=password-updated");
}

export async function signOut() {
  try {
    const client = await createSupabaseServerClient(true);
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Always remove this browser’s credentials, including during an Auth outage.
  } finally {
    await clearAuthCookies();
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
