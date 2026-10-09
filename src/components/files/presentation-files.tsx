import { FileAvailability } from "@/components/archive/file-availability";
import { fileSizeLimit, presentationFiles } from "@/lib/files/server";
import { formatFileSize } from "@/lib/files/config";
import { FileManager } from "./file-manager";
import { PdfPreview } from "./pdf-preview";

export async function PresentationFiles({
  id,
  canManage,
}: {
  id: string;
  canManage: boolean;
}) {
  const files = await presentationFiles(id);
  const powerpoint = files.find((file) => file.kind === "powerpoint");
  const pdf = files.find((file) => file.kind === "pdf");
  const base = `/api/presentations/${id}/files`;
  let maxBytes: number | null = null;
  if (canManage) {
    try {
      maxBytes = await fileSizeLimit();
    } catch {
      /* Preserve metadata access during a storage outage. */
    }
  }
  return (
    <section aria-labelledby="files-heading" className="panel mt-6 p-6 sm:p-8">
      <h2 id="files-heading" className="mb-4 text-lg font-semibold">
        Presentation files
      </h2>
      <FileAvailability
        hasPowerPoint={Boolean(powerpoint)}
        hasPdf={Boolean(pdf)}
      />
      {powerpoint && (
        <div className="mt-5">
          <p className="text-sm wrap-anywhere text-muted">
            {powerpoint.filename} · {formatFileSize(powerpoint.size)}
          </p>
          <a
            href={`${base}/powerpoint?v=${powerpoint.id}`}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-5 py-3 text-sm font-semibold hover:bg-canvas"
          >
            Download PowerPoint
          </a>
        </div>
      )}
      {pdf ? (
        <PdfPreview key={pdf.id} href={`${base}/pdf`} version={pdf.id} />
      ) : (
        <p className="mt-3 text-sm leading-7 text-muted">
          A PDF preview has not been uploaded yet.
        </p>
      )}
      {canManage &&
        (maxBytes ? (
          <FileManager id={id} files={files} maxBytes={maxBytes} />
        ) : (
          <p role="alert" className="mt-6 text-sm leading-7 text-brand">
            Uploads are temporarily unavailable. Reload the page to retry, or
            contact an administrator if this continues.
          </p>
        ))}
    </section>
  );
}
