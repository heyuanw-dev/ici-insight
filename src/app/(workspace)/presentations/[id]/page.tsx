import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/layout/route-placeholder";

export const metadata: Metadata = { title: "Presentation" };

export default function PresentationPage() {
  return (
    <RoutePlaceholder
      title="Presentation details"
      description="The topic, context, and materials behind a team presentation."
      message="Presentation details and slides are not available in this preview."
    />
  );
}
