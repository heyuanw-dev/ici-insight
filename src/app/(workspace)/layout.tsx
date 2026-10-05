import type { ReactNode } from "react";

// Structural boundary for the future authenticated workspace.
// Phase 1 renders empty shells only; it does not query internal data.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return children;
}
