import { revalidatePath } from "next/cache";
import { createStorageAdminClient } from "@/lib/supabase/storage-admin";
import { isUuid } from "@/lib/auth/redirects";
import { isFileKind, slidesBucket } from "@/lib/files/config";
import { validateFileContent } from "@/lib/files/validate-content";
import {
  checkFileOrigin,
  fileError,
  fileMutationError,
  FileRequestError,
  fileRequestEmployee,
  fileSizeLimit,
} from "@/lib/files/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; uploadId: string }> },
) {
  try {
    checkFileOrigin(request);
    const { id, uploadId } = await context.params;
    const { employee } = await fileRequestEmployee(id, true);
    if (!isUuid(uploadId)) throw new FileRequestError("Upload not found.", 404);
    const admin = createStorageAdminClient();
    const { data: upload, error } = await admin
      .from("presentation_file_uploads")
      .select("*")
      .eq("id", uploadId)
      .eq("presentation_id", id)
      .eq("uploaded_by", employee.id)
      .maybeSingle();
    if (error) throw new Error("Upload information is unavailable.");
    if (!upload || !isFileKind(upload.kind))
      throw new FileRequestError("Upload not found.", 404);
    if (
      upload.failed_at ||
      (!upload.completed_at && Date.parse(upload.expires_at) <= Date.now())
    )
      throw fileMutationError("file_upload_expired");
    if (!upload.completed_at) {
      const limit = await fileSizeLimit();
      if (upload.size_bytes > limit)
        throw new FileRequestError("This file exceeds the current size limit.");
      const stored = await admin.storage
        .from(slidesBucket)
        .download(upload.object_path);
      if (stored.error)
        throw new FileRequestError(
          "The upload has not finished or could not be read. Retry the upload.",
          409,
        );
      try {
        if (stored.data.size !== upload.size_bytes || stored.data.size > limit)
          throw new Error(
            "The uploaded size does not match the selected file. Please upload it again.",
          );
        await validateFileContent(
          upload.kind,
          Buffer.from(await stored.data.arrayBuffer()),
        );
      } catch (validationError) {
        // Terminal validation failure never touches the current file. The upload
        // remains private even if a still-valid upload-only token is replayed.
        await admin
          .from("presentation_file_uploads")
          .update({ failed_at: new Date().toISOString() })
          .eq("id", uploadId);
        await admin.storage.from(slidesBucket).remove([upload.object_path]);
        throw new FileRequestError(
          validationError instanceof Error
            ? validationError.message
            : "This file is invalid.",
        );
      }
    }
    const completed = await admin.rpc("complete_file_upload", {
      p_upload_id: upload.id,
      p_auth_user_id: employee.auth_user_id,
    });
    if (completed.error) throw fileMutationError(completed.error.message);
    revalidatePath(`/presentations/${id}`);
    revalidatePath("/archive");
    return Response.json(
      { success: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fileError(error);
  }
}
