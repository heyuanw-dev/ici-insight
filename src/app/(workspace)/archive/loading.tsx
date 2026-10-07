export default function ArchiveLoading() {
  return (
    <div
      role="status"
      aria-label="Loading presentation archive"
      className="space-y-6 motion-safe:animate-pulse"
    >
      <p className="text-sm text-muted">Loading presentation archive…</p>
      <div className="h-9 w-3/5 rounded-lg bg-line" />
      <div className="panel h-80" />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="panel h-64" />
        <div className="panel h-64" />
      </div>
    </div>
  );
}
