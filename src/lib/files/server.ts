import "server-only";
import { getAuthSnapshot } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createStorageAdminClient } from "@/lib/supabase/storage-admin";
import { getSupabaseEnvironment } from "@/lib/supabase/config";
import { isUuid } from "@/lib/auth/redirects";
import { isFileKind, slidesBucket, type SlideFile } from "./config";
import { RequestBodyError } from "@/lib/security/request-body";

export class FileRequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function fileError(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof FileRequestError || error instanceof RequestBodyError
          ? error.message
          : "The file service is unavailable. Please try again.",
    },
    {
      status:
        error instanceof FileRequestError || error instanceof RequestBodyError
          ? error.status
          : 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
export function checkFileOrigin(request: Request) {
  if (request.headers.get("origin") !== getSupabaseEnvironment()?.appUrl)
    throw new FileRequestError(
      "This request could not be verified. Reload the page and try again.",
      403,
    );
}
export async function fileRequestEmployee(id: string, manage = false) {
  const auth = await getAuthSnapshot();
  if (auth.kind !== "authenticated")
    throw new FileRequestError(
      "Sign in with an active employee account to access slides.",
      401,
    );
  if (auth.employee.password_setup_required)
    throw new FileRequestError(
      "Finish setting up your password before accessing slides.",
      403,
    );
  if (!isUuid(id)) throw new FileRequestError("Presentation not found.", 404);
  const client = await createSupabaseServerClient(true);
  const { data, error } = await client
    .rpc("presentation_permissions", { presentation_id: id })
    .maybeSingle();
  if (error)
    throw new FileRequestError(
      "Presentation access could not be checked. Please retry.",
      503,
    );
  if (!data || (manage && !data.can_manage_files))
    throw new FileRequestError(
      "Presentation or file permission is unavailable.",
      404,
    );
  return { employee: auth.employee, client };
}
export async function fileSizeLimit() {
  const { data, error } =
    await createStorageAdminClient().storage.getBucket(slidesBucket);
  if (error || !data || data.public || !data.file_size_limit)
    throw new Error("Private file storage is unavailable.");
  return data.file_size_limit;
}
export async function presentationFiles(id: string) {
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("presentation_files")
    .select("id,kind,original_filename,size_bytes")
    .eq("presentation_id", id);
  if (error) throw new Error("Presentation files could not be loaded.");
  return data.flatMap((file): SlideFile[] =>
    isFileKind(file.kind)
      ? [
          {
            id: file.id,
            kind: file.kind,
            filename: file.original_filename,
            size: file.size_bytes,
          },
        ]
      : [],
  );
}
export function fileMutationError(message: string) {
  if (message === "file_changed")
    return new FileRequestError(
      "Another file was saved while you were working. Reload the presentation before replacing it.",
      409,
    );
  if (message === "file_access_denied")
    return new FileRequestError(
      "Your permission to manage these files is no longer available.",
      403,
    );
  if (message === "file_upload_expired")
    return new FileRequestError(
      "This upload expired. Select the file and upload again.",
      409,
    );
  return new FileRequestError(
    "The file could not be saved. Check its type and size, then retry.",
    400,
  );
}
