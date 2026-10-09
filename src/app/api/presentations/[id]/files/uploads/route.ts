import { createStorageAdminClient } from "@/lib/supabase/storage-admin";
import { isUuid } from "@/lib/auth/redirects";
import {
  fileTypes,
  isFileKind,
  slidesBucket,
  validateFileInput,
} from "@/lib/files/config";
import {
  checkFileOrigin,
  fileError,
  fileMutationError,
  FileRequestError,
  fileRequestEmployee,
  fileSizeLimit,
} from "@/lib/files/server";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkFileOrigin(request);
    const { id } = await context.params;
    const { client } = await fileRequestEmployee(id, true);
    const body = await request.text();
    if (body.length > 4096)
      throw new FileRequestError("The file request is too large.", 413);
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      throw new FileRequestError("Invalid file request.");
    }
    if (
      !input ||
      typeof input !== "object" ||
      !("kind" in input) ||
      !isFileKind(input.kind) ||
      !("name" in input) ||
      typeof input.name !== "string" ||
      !("size" in input) ||
      typeof input.size !== "number" ||
      !("mime" in input) ||
      typeof input.mime !== "string" ||
      !("expectedFileId" in input) ||
      (input.expectedFileId !== null &&
        (typeof input.expectedFileId !== "string" ||
          !isUuid(input.expectedFileId)))
    )
      throw new FileRequestError(
        "Choose a PowerPoint or PDF file and try again.",
      );
    const error = validateFileInput(
      input.kind,
      input.name,
      input.size,
      input.mime,
      await fileSizeLimit(),
    );
    if (error) throw new FileRequestError(error);
    const prepared = await client.rpc("prepare_file_upload", {
      p_presentation_id: id,
      p_kind: input.kind,
      p_filename: input.name,
      p_size_bytes: input.size,
      p_mime_type: fileTypes[input.kind].mime,
      p_expected_file_id: input.expectedFileId ?? undefined,
    });
    if (prepared.error) throw fileMutationError(prepared.error.message);
    const upload = prepared.data;
    const signed = await createStorageAdminClient()
      .storage.from(slidesBucket)
      .createSignedUploadUrl(upload.object_path, { upsert: false });
    if (signed.error) throw new Error("Upload could not be prepared.");
    return Response.json(
      {
        uploadId: upload.id,
        uploadUrl: signed.data.signedUrl,
        mime: upload.mime_type,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fileError(error);
  }
}
