import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/layout/route-placeholder";

export const metadata: Metadata = { title: "Edit presentation" };

export default function EditPresentationPage() {
  return (
    <RoutePlaceholder
      title="Edit presentation"
      description="Keep your upcoming presentation up to date."
      message="Editing and rescheduling are not available in this preview."
    />
  );
}
