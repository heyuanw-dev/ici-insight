import type { ReactNode } from "react";
import { requireEmployee } from "@/lib/auth/session";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireEmployee();
  return children;
}
