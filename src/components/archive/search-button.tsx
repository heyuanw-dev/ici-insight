"use client";

import { useFormStatus } from "react-dom";

export function SearchButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="min-h-11 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Searching…" : "Search archive"}
    </button>
  );
}
