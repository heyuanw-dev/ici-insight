import { requirePresentationAccess } from "@/lib/auth/session";
import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/layout/route-placeholder";

export const metadata: Metadata = { title: "Edit presentation" };

export default async function EditPresentationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePresentationAccess(id, true);
  return (
    <RoutePlaceholder
      title="Edit presentation"
      description="Keep your upcoming presentation up to date."
      message="Editing and rescheduling are not available in this preview."
    />
  );
}
