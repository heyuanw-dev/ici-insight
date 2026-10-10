export class RequestBodyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Upload metadata is tiny JSON. Bound bytes while streaming, even when a caller
// omits Content-Length or sends a misleading value. Slide bytes bypass the app.
export async function readSmallJson(
  request: Request,
  maxBytes = 4096,
): Promise<unknown> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json")
    throw new RequestBodyError("Send the file request as JSON.", 415);
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await request.body?.cancel();
    throw new RequestBodyError("The file request is too large.", 413);
  }
  if (!request.body) throw new RequestBodyError("Invalid file request.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("The file request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RequestBodyError("Invalid file request.", 400);
  }
}
