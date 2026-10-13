export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="page-container flex flex-col gap-2 py-6 text-xs leading-6 text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-semibold text-ink">ICI Lab</span>
          <span className="mx-3 text-line" aria-hidden="true">
            /
          </span>
          A shared space for AI insight.
        </p>
        <p>
          Weekly, usually Tuesdays{" "}
          <span className="mx-2" aria-hidden="true">
            ·
          </span>{" "}
          Vancouver time
        </p>
      </div>
    </footer>
  );
}
