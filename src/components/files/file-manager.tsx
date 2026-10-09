"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  fileTypes,
  formatFileSize,
  validateFileInput,
  type FileKind,
  type SlideFile,
} from "@/lib/files/config";

async function post(url: string, input?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: input ? JSON.stringify(input) : undefined,
  });
  const parsed: unknown = await response.json();
  if (!parsed || typeof parsed !== "object")
    throw new Error("Unexpected file response. Please reload and retry.");
  const result = parsed as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "The file could not be saved. Please retry.",
    );
  return result;
}
function transfer(
  url: string,
  mime: string,
  file: File,
  progress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.setRequestHeader(
      "apikey",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    );
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error(
              "The upload did not finish. Check your connection and the file size, then retry.",
            ),
          );
    xhr.onerror = xhr.ontimeout = () =>
      reject(new Error("The upload connection was interrupted. Please retry."));
    xhr.send(file);
  });
}

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
    const base = `/api/presentations/${id}/files/uploads`;
    try {
      const prepared = await post(base, {
        kind,
        name: selected.name,
        size: selected.size,
        mime: selected.type,
        expectedFileId: files.find((file) => file.kind === kind)?.id ?? null,
      });
      if (
        typeof prepared.uploadUrl !== "string" ||
        typeof prepared.mime !== "string" ||
        typeof prepared.uploadId !== "string"
      )
        throw new Error("The upload could not be prepared. Please retry.");
      setStage("Uploading…");
      await transfer(prepared.uploadUrl, prepared.mime, selected, setProgress);
      setStage("Validating and saving…");
      await post(`${base}/${prepared.uploadId}`);
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
        can be up to {formatFileSize(maxBytes)}. You can replace slides after
        the presentation. These changes leave presentation details unchanged.
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
                  aria-describedby={`upload-${kind}-hint`}
                  className="block min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-canvas file:px-3 file:py-2 file:font-medium"
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
