import { randomUUID } from "node:crypto";
import { test as base, localSql } from "./schedule-fixtures";
import { isUuid } from "../../src/lib/auth/redirects";

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
type ArchiveFixtures = {
  tag: string;
  category: (name: string, active?: boolean) => string;
  formerPresenter: (name: string) => string;
  presentation: (options: {
    title: string;
    offset?: number;
    presenter?: string;
    category?: string;
    description?: string;
    referenceUrl?: string;
    cancelled?: boolean;
    deleted?: boolean;
    pdf?: boolean;
    powerpoint?: boolean;
  }) => { id: string; date: string; number: number };
};

export const test = base.extend<{ archive: ArchiveFixtures }>({
  archive: async ({ slots, account }, provideArchive) => {
    const presentationIds: string[] = [],
      categoryIds: string[] = [],
      presenterIds: string[] = [];
    const identifier = (output: string) => {
      const id = output.split("\n").find(isUuid);
      if (!id) throw new Error("Archive test fixture could not be created.");
      return id;
    };
    try {
      await provideArchive({
        tag: `Archive-${randomUUID().slice(0, 8)}`,
        category(name, active = true) {
          const id = identifier(
            localSql(
              `insert into public.categories(name,is_active) values (${literal(name)},${active}) returning id;`,
            ),
          );
          categoryIds.push(id);
          return id;
        },
        formerPresenter(name) {
          const id = identifier(
            localSql(
              `insert into public.users(name,email,is_active) values (${literal(name)},${literal(`e2e-former-${randomUUID()}@example.test`)},false) returning id;`,
            ),
          );
          presenterIds.push(id);
          return id;
        },
        presentation(options) {
          const slot = slots.create(options.offset ?? -1);
          const id = identifier(
            localSql(`insert into public.presentations(slot_id,presenter_user_id,title,description,category_id,reference_url,cancelled_at,deleted_at)
            values ('${slot.id}',${literal(options.presenter ?? account.id)},${literal(options.title)},${options.description ? literal(options.description) : "null"},${options.category ? literal(options.category) : "null"},${options.referenceUrl ? literal(options.referenceUrl) : "null"},${options.cancelled ? "now()" : "null"},${options.deleted ? "now()" : "null"}) returning id;`),
          );
          presentationIds.push(id);
          for (const kind of ["pdf", "powerpoint"] as const)
            if (options[kind]) {
              const extension = kind === "pdf" ? "pdf" : "pptx";
              const mime =
                kind === "pdf"
                  ? "application/pdf"
                  : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
              localSql(`insert into public.presentation_files(presentation_id,kind,bucket,object_path,original_filename,mime_type,size_bytes,uploaded_by)
              values ('${id}','${kind}','test-private-slides','${id}/slides.${extension}','slides.${extension}','${mime}',100,'${account.id}');`);
            }
          return { id, date: slot.date, number: slot.number };
        },
      });
    } finally {
      if (presentationIds.length) {
        const list = presentationIds.map(literal).join(",");
        localSql(
          `delete from public.presentation_files where presentation_id in (${list}); delete from public.presentations where id in (${list});`,
        );
      }
      if (categoryIds.length)
        localSql(
          `delete from public.categories where id in (${categoryIds.map(literal).join(",")});`,
        );
      if (presenterIds.length)
        localSql(
          `delete from public.users where id in (${presenterIds.map(literal).join(",")});`,
        );
    }
  },
});
export { expect, localSql, signIn } from "./schedule-fixtures";
