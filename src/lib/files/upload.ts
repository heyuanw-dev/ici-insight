"use client";

import type { FileKind } from "./config";

async function post(url: string, input?: unknown) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: input ? JSON.stringify(input) : undefined,
    });
  } catch {
    throw new Error("The upload connection was interrupted. Please retry.");
  }
  const parsed: unknown = await response.json().catch(() => null);
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

export async function uploadSlide({
  id,
  kind,
  file,
  expectedFileId = null,
  onStage,
  onProgress,
}: {
  id: string;
  kind: FileKind;
  file: File;
  expectedFileId?: string | null;
  onStage: (stage: string) => void;
  onProgress: (percent: number) => void;
}) {
  onStage("Preparing upload…");
  onProgress(0);
  const base = `/api/presentations/${id}/files/uploads`;
  const prepared = await post(base, {
    kind,
    name: file.name,
    size: file.size,
    mime: file.type,
    expectedFileId,
  });
  if (
    typeof prepared.uploadUrl !== "string" ||
    typeof prepared.mime !== "string" ||
    typeof prepared.uploadId !== "string"
  )
    throw new Error("The upload could not be prepared. Please retry.");
  onStage("Uploading…");
  await transfer(prepared.uploadUrl, prepared.mime, file, onProgress);
  onStage("Validating and saving…");
  await post(`${base}/${prepared.uploadId}`);
}
