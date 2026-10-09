import { fetchPrivateFile } from "@/lib/supabase/storage-admin";
import { fileTypes, isFileKind, slidesBucket } from "@/lib/files/config";
import { FileRequestError, fileRequestEmployee } from "@/lib/files/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; kind: string }> },
) {
  try {
    const { id, kind } = await context.params;
    const { client } = await fileRequestEmployee(id);
    if (!isFileKind(kind)) throw new FileRequestError("File not found.", 404);
    const { data: file, error } = await client
      .from("presentation_files")
      .select("id,bucket,object_path,original_filename")
      .eq("presentation_id", id)
      .eq("kind", kind)
      .maybeSingle();
    if (error) throw new Error("File information is unavailable.");
    if (!file || file.bucket !== slidesBucket)
      throw new FileRequestError(
        "This file is not available. Return to the presentation and try again.",
        404,
      );
    const version = new URL(request.url).searchParams.get("v");
    if (version && version !== file.id)
      throw new FileRequestError(
        "These slides have changed. Return to the presentation and open the latest file.",
        409,
      );
    const range = request.headers.get("range");
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
      throw new FileRequestError("This file range is not supported.", 416);
    const stored = await fetchPrivateFile(file.object_path, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: range ? { Range: range } : {},
      signal: request.signal,
    });
    if (!stored.ok) {
      await stored.body?.cancel();
      throw new FileRequestError(
        "This file could not be opened. Return to the presentation and retry.",
        stored.status === 416 ? 416 : 404,
      );
    }
    const filename = encodeURIComponent(file.original_filename)
      .replaceAll("'", "%27")
      .replaceAll("(", "%28")
      .replaceAll(")", "%29");
    const headers = new Headers({
      "Content-Type": fileTypes[kind].mime,
      "Content-Disposition": `${kind === "pdf" ? "inline" : "attachment"}; filename="slides${fileTypes[kind].extension}"; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      // Chromium's native PDF viewer uses an embed internally. An object-src
      // prohibition here would block the document's own preview.
      "Content-Security-Policy": "frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
      "Accept-Ranges": "bytes",
    });
    const contentRange = stored.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    if (request.method === "HEAD") {
      const size = stored.headers.get("content-length");
      if (size) headers.set("Content-Length", size);
    }
    // Stream large files rather than buffering a serverless response. Each new
    // request, including PDF ranges, repeats membership and visibility checks.
    return new Response(stored.body, { status: stored.status, headers });
  } catch (error) {
    return new Response(
      error instanceof FileRequestError
        ? error.message
        : "The file service is unavailable. Return to the presentation and retry.",
      {
        status: error instanceof FileRequestError ? error.status : 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
}
export const HEAD = GET;
