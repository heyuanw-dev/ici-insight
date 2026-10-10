"use client";

import { useEffect, useRef } from "react";

// Server Actions may return the same message on repeated submissions. Track the
// returned state object, not its text, and focus after controls are re-enabled.
export function useFormFeedback(state: unknown, hasFeedback: boolean) {
  const form = useRef<HTMLFormElement>(null);
  const lastFocused = useRef(state);
  useEffect(() => {
    if (!hasFeedback || state === lastFocused.current) return;
    lastFocused.current = state;
    const invalid = form.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]:not(:disabled)',
    );
    const summary = form.current?.querySelector<HTMLElement>(
      "[data-form-feedback]",
    );
    (invalid ?? summary)?.focus();
  }, [state, hasFeedback]);
  return form;
}
