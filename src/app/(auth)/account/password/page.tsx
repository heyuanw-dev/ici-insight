import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/layout/route-placeholder";

export const metadata: Metadata = { title: "Account password" };

export default function PasswordPage() {
  return (
    <RoutePlaceholder
      title="Account password"
      description="Manage access to your ICI Lab account."
      message="Account setup and password recovery are not available in this preview. No credentials are collected."
      icon="lock"
    />
  );
}
