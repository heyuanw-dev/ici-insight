"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  fileTypes,
  formatFileSize,
  validateFileInput,
  type FileKind,
  type SlideFile,
} from "@/lib/files/config";

import { uploadSlide } from "@/lib/files/upload";

export function FileManager({
  id,
  files,
  maxBytes,
}: {
  id: string;
  files: SlideFile[];
  maxBytes: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<FileKind | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [message, setMessage] = useState<{
    kind: FileKind;
    text: string;
    error: boolean;
  } | null>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message?.error) feedback.current?.focus();
  }, [message]);
  async function submit(event: FormEvent<HTMLFormElement>, kind: FileKind) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const selected = new FormData(form).get("file");
    if (!(selected instanceof File)) return;
    const invalid = validateFileInput(
      kind,
      selected.name,
      selected.size,
      selected.type,
      maxBytes,
    );
    if (invalid) {
      setMessage({ kind, text: invalid, error: true });
      return;
    }
    setPending(kind);
    setMessage(null);
    setProgress(0);
    setStage("Preparing upload…");
    try {
      await uploadSlide({
        id,
        kind,
        file: selected,
        expectedFileId: files.find((file) => file.kind === kind)?.id ?? null,
        onStage: setStage,
        onProgress: setProgress,
      });
      form.reset();
      setMessage({
        kind,
        text: `${fileTypes[kind].label} saved successfully.`,
        error: false,
      });
      router.refresh();
    } catch (error) {
      setMessage({
        kind,
        text:
          error instanceof Error
            ? error.message
            : "The upload failed. Please retry.",
        error: true,
      });
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="mt-8 border-t border-line pt-6">
      <h3 className="text-lg font-semibold">Manage slides</h3>
      <p className="mt-2 text-sm leading-7 text-muted">
        Upload a PowerPoint and an optional PDF for browser viewing. Each file
        can be up to {formatFileSize(maxBytes)}. You can upload or replace
        slides before or after the presentation. These changes leave
        presentation details unchanged.
      </p>
      <p className="mt-2 text-sm leading-7 text-muted">
        When replacing slides, update the PDF too if its content has changed.
        Your current files stay available until each replacement is saved.
      </p>
      <div className="mt-6 space-y-6">
        {(["powerpoint", "pdf"] as const).map((kind) => {
          const current = files.find((file) => file.kind === kind);
          return (
            <form
              key={kind}
              aria-label={`Manage ${fileTypes[kind].label}`}
              onSubmit={(event) => void submit(event, kind)}
              className="rounded-lg border border-line p-4 sm:p-5"
            >
              <fieldset disabled={Boolean(pending)}>
                <legend className="text-sm font-semibold">
                  {fileTypes[kind].label}
                </legend>
                {current && (
                  <p className="mt-2 text-sm wrap-anywhere text-muted">
                    Current: {current.filename} · {formatFileSize(current.size)}
                  </p>
                )}
                <label
                  htmlFor={`upload-${kind}`}
                  className="mt-4 mb-2 block text-sm font-medium"
                >
                  Choose {fileTypes[kind].extension} file
                </label>
                <input
                  id={`upload-${kind}`}
                  name="file"
                  type="file"
                  required
                  accept={`${fileTypes[kind].extension},${fileTypes[kind].mime}`}
                  aria-invalid={message?.kind === kind && message.error}
                  aria-describedby={`upload-${kind}-hint${message?.kind === kind && message.error ? ` upload-${kind}-error` : ""}`}
                  className="block min-h-11 w-full min-w-0 rounded-lg border border-control bg-surface p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-canvas file:px-3 file:py-2 file:font-medium"
                />
                <p
                  id={`upload-${kind}-hint`}
                  className="mt-2 text-xs leading-6 text-muted"
                >
                  {fileTypes[kind].extension} only · Maximum{" "}
                  {formatFileSize(maxBytes)}
                </p>
                <button
                  type="submit"
                  aria-busy={pending === kind}
                  className="mt-4 min-h-11 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
                >
                  {pending === kind
                    ? stage
                    : `${current ? "Replace" : "Upload"} ${fileTypes[kind].label}`}
                </button>
              </fieldset>
              {pending === kind && (
                <div className="mt-4" role="status">
                  <p className="text-sm text-muted">
                    {stage}
                    {stage === "Uploading…" ? ` ${progress}%` : ""}
                  </p>
                  <progress
                    aria-label={`${fileTypes[kind].label} upload progress`}
                    max={100}
                    value={progress}
                    className="mt-2 h-2 w-full accent-brand"
                  />
                </div>
              )}
              {message?.kind === kind && (
                <p
                  ref={feedback}
                  id={`upload-${kind}-error`}
                  tabIndex={-1}
                  role={message.error ? "alert" : "status"}
                  className={`mt-4 text-sm leading-7 ${message.error ? "text-brand" : "text-ink"}`}
                >
                  {message.text}
                  {message.error && (
                    <a
                      href={`/presentations/${id}`}
                      className="mt-2 block min-h-11 font-semibold underline"
                    >
                      Reload presentation
                    </a>
                  )}
                </p>
              )}
            </form>
          );
        })}
      </div>
    </div>
  );
}
