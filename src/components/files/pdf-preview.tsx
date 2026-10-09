"use client";
import { useState } from "react";

export function PdfPreview({
  href,
  version,
}: {
  href: string;
  version: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const versionedHref = `${href}?v=${encodeURIComponent(version)}`;
  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold">Slide preview</h3>
      <p className="mt-2 text-sm leading-7 text-muted">
        If your browser cannot display the slides here, open the PDF in a new
        tab.
      </p>
      <a
        href={versionedHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline"
      >
        Open PDF in a new tab
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {!loaded && (
        <p role="status" className="my-3 text-sm text-muted">
          Loading PDF preview…
        </p>
      )}
      <iframe
        key={version}
        src={versionedHref}
        title="Presentation PDF slides"
        onLoad={() => setLoaded(true)}
        className="mt-3 h-[28rem] w-full rounded-lg border border-line bg-canvas sm:h-[40rem]"
      />
    </div>
  );
}
