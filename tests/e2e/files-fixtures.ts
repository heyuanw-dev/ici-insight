import { test as base } from "./archive-fixtures";
import { adminClient, localSql } from "./fixtures";
import { slidesBucket } from "../../src/lib/files/config";

export async function cleanFiles(presentationId: string) {
  const paths = localSql(
    `select object_path from public.presentation_file_uploads where presentation_id='${presentationId}'`,
  )
    .split("\n")
    .filter(Boolean);
  if (paths.length) {
    const { error } = await adminClient()
      .storage.from(slidesBucket)
      .remove(paths);
    if (error) throw new Error("Could not clean test slide objects.");
  }
}
export const test = base.extend<{ fileCleanup: void }>({
  fileCleanup: [
    async ({ archive, account }, provideCleanup) => {
      void archive;
      try {
        await provideCleanup();
      } finally {
        const paths = localSql(
          `select object_path from public.presentation_file_uploads where uploaded_by='${account.id}'`,
        )
          .split("\n")
          .filter(Boolean);
        if (paths.length) {
          const { error } = await adminClient()
            .storage.from(slidesBucket)
            .remove(paths);
          if (error) throw new Error("Could not clean test slide objects.");
        }
      }
    },
    { auto: true },
  ],
});
export { expect, signIn, localSql } from "./archive-fixtures";
