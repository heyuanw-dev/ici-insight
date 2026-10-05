"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="panel p-10 text-center" role="alert">
      <h1 className="text-2xl font-semibold">Something didn’t load.</h1>
      <p className="mt-3 text-muted">
        Please try again. If the problem continues, come back in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 min-h-11 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-hover"
      >
        Try again
      </button>
    </div>
  );
}
