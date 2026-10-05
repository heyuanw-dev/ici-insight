import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/layout/route-placeholder";

export const metadata: Metadata = { title: "Volunteer to present" };

export default function NewPresentationPage() {
  return (
    <RoutePlaceholder
      title="Share an AI insight"
      description="Bring a new idea to the team’s weekly conversation."
      message="Presentation registration is not available in this preview. You’ll be able to choose an available slot from the schedule."
      icon="calendar"
    />
  );
}
