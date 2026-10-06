import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/auth/redirects";
import type { Database } from "@/types/database";
import type { UserRole } from "@/types/domain";

export type Employee = {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  role: UserRole;
  password_setup_required: boolean;
};

export type AuthSnapshot =
  | { kind: "authenticated"; employee: Employee }
  | { kind: "unconfigured" | "signed-out" | "unavailable" | "denied" };

export async function loadEmployee(
  client: SupabaseClient<Database>,
  user: User,
): Promise<Employee | null> {
  if (user.is_anonymous || !user.email_confirmed_at) return null;
  const { data, error } = await client
    .from("users")
    .select(
      "id, auth_user_id, name, email, role, is_active, password_setup_required",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Employee access could not be checked.");
  if (
    !data ||
    !data.is_active ||
    !data.auth_user_id ||
    (data.role !== "user" && data.role !== "admin")
  )
    return null;
  return {
    id: data.id,
    auth_user_id: data.auth_user_id,
    name: data.name,
    email: data.email,
    role: data.role,
    password_setup_required: data.password_setup_required,
  };
}

// React cache deduplicates lookups only within one render/request. No cross-user cache.
export const getAuthSnapshot = cache(async (): Promise<AuthSnapshot> => {
  if (!getSupabaseEnvironment()) return { kind: "unconfigured" };
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getUser();
    if (error)
      return {
        kind:
          error.status && error.status >= 500 ? "unavailable" : "signed-out",
      };
    if (!data.user) return { kind: "signed-out" };
    const employee = await loadEmployee(client, data.user);
    return employee ? { kind: "authenticated", employee } : { kind: "denied" };
  } catch {
    return { kind: "unavailable" };
  }
});

export async function requireEmployee(
  allowPasswordSetup = false,
): Promise<Employee> {
  const auth = await getAuthSnapshot();
  if (auth.kind !== "authenticated") {
    redirect(
      auth.kind === "denied"
        ? "/login?notice=access"
        : auth.kind === "unavailable"
          ? "/login?notice=unavailable"
          : "/login",
    );
  }
  if (auth.employee.password_setup_required && !allowPasswordSetup)
    redirect("/account/password");
  return auth.employee;
}

export async function requireAdmin(): Promise<Employee> {
  const employee = await requireEmployee();
  if (employee.role !== "admin") notFound();
  return employee;
}

export async function requirePresentationAccess(id: string, edit = false) {
  await requireEmployee();
  if (!isUuid(id)) notFound();
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .rpc("presentation_permissions", { presentation_id: id })
    .maybeSingle();
  if (error)
    throw new Error(
      "Presentation access could not be checked. Please try again.",
    );
  if (!data || (edit && !data.can_edit_metadata)) notFound();
  return data;
}
