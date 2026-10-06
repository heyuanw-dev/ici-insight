import { requirePresentationAccess } from "@/lib/auth/session";
import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/layout/route-placeholder";

export const metadata: Metadata = { title: "Presentation" };

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePresentationAccess(id, false);
  return (
    <RoutePlaceholder
      title="Presentation details"
      description="The topic, context, and materials behind a team presentation."
      message="Presentation details and slides are not available in this preview."
    />
  );
}
