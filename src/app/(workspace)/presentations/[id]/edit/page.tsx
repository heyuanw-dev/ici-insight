import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { EditPresentationForm } from "@/components/schedule/edit-presentation-form";
import { getEditPresentation } from "@/lib/schedule/edit-data";

export const metadata: Metadata = { title: "Edit presentation" };

export default async function EditPresentationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getEditPresentation(id);
  const presentation = data.presentation;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Your upcoming presentation"
        title="Edit presentation"
        description="Update your topic, choose another slot, or cancel your upcoming presentation. Same-day changes are allowed until midnight in Vancouver."
      />
      <p className="mb-6 wrap-anywhere text-sm text-muted">
        Presenter:{" "}
        <span className="font-medium text-ink">{data.presenter}</span>
      </p>
      {data.unavailable ? (
        <div className="panel space-y-4 p-6">
          <p className="text-sm leading-7">{data.unavailable}</p>
          <ButtonLink href="/schedule">Back to schedule</ButtonLink>
        </div>
      ) : (
        <EditPresentationForm
          key={`${id}-${presentation.revision}`}
          id={id}
          revision={presentation.revision}
          currentSlot={{
            date: data.slot.presentation_date,
            number: data.slot.slot_number,
            isOpen: data.slot.is_open,
          }}
          initial={{
            slotId: presentation.slot_id,
            values: {
              title: presentation.title,
              categoryId: presentation.category_id ?? "",
              description: presentation.description ?? "",
              referenceUrl: presentation.reference_url ?? "",
            },
          }}
          categories={data.categories}
          available={data.available}
        />
      )}
    </div>
  );
}
