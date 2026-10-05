export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="space-y-6 motion-safe:animate-pulse"
    >
      <span className="sr-only">Loading page…</span>
      <div className="h-9 w-3/5 rounded-lg bg-line" />
      <div className="h-5 w-4/5 rounded-lg bg-line" />
      <div className="panel h-72" />
    </div>
  );
}
