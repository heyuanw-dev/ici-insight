import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, beforeEach, after, test } from "node:test";
import { database, asEmployee } from "./helpers.mjs";

let db;
before(async () => {
  db = await database();
});
after(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "truncate public.presentation_file_uploads, public.presentation_files, public.presentations, public.presentation_slots, public.users, auth.users, storage.objects cascade",
  );
});
async function employee(role = "user") {
  const authId = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())",
    [authId, `${authId}@example.test`],
  );
  const {
    rows: [row],
  } = await db.query(
    "insert into public.users(auth_user_id,name,email,role,password_setup_required) values ($1,'Presenter',$2,$3,false) returning id",
    [authId, `${authId}@example.test`, role],
  );
  return { authId, id: row.id };
}
async function presentation(who, offset = -1) {
  const {
    rows: [slot],
  } = await db.query(
    "insert into public.presentation_slots(presentation_date,slot_number) values ((now() at time zone 'America/Vancouver')::date + $1::int,coalesce((select max(slot_number)+1 from public.presentation_slots),1)) returning id",
    [offset],
  );
  return (
    await db.query(
      "insert into public.presentations(slot_id,presenter_user_id,title) values ($1,$2,'Retained historical metadata') returning *",
      [slot.id, who.id],
    )
  ).rows[0];
}
async function prepare(
  who,
  id,
  {
    expected = null,
    kind = "pdf",
    name = "slides.pdf",
    mime = "application/pdf",
    size = 100,
  } = {},
) {
  return asEmployee(
    db,
    who.authId,
    async () =>
      (
        await db.query(
          "select * from public.prepare_file_upload($1,$2,$3,$4,$5,$6)",
          [id, kind, name, mime, size, expected],
        )
      ).rows[0],
  );
}
async function object(
  upload,
  { size = upload.size_bytes, mime = upload.mime_type } = {},
) {
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values ('presentation-slides',$1,$2::jsonb)",
    [
      upload.object_path,
      JSON.stringify({ size: Number(size), mimetype: mime }),
    ],
  );
}
async function complete(who, upload) {
  await db.exec("set role service_role");
  try {
    return (
      await db.query("select public.complete_file_upload($1,$2) as id", [
        upload.id,
        who.authId,
      ])
    ).rows[0].id;
  } finally {
    await db.exec("reset role");
  }
}

test("historical owner can publish and replace slides without changing historical metadata or requiring both formats", async () => {
  const who = await employee(),
    p = await presentation(who);
  const first = await prepare(who, p.id);
  await object(first);
  assert.equal(await complete(who, first), first.id);
  assert.equal(await complete(who, first), first.id); // Retry after lost response.
  const second = await prepare(who, p.id, {
    expected: first.id,
    name: "revised.pdf",
  });
  await object(second);
  await complete(who, second);
  const file = (await db.query("select * from public.presentation_files"))
    .rows[0];
  assert.equal(file.id, second.id);
  assert.equal(file.original_filename, "revised.pdf");
  assert.notEqual(first.object_path, second.object_path);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    2,
  );
  assert.deepEqual(
    (await db.query("select * from public.presentations where id=$1", [p.id]))
      .rows[0],
    p,
  );
  await asEmployee(db, who.authId, async () => {
    const permissions = (
      await db.query("select * from public.presentation_permissions($1)", [
        p.id,
      ])
    ).rows[0];
    assert.equal(permissions.can_manage_files, true);
    assert.equal(permissions.can_edit_metadata, false);
  });
});

test("only the owner or an active administrator can prepare files; cancelled records retain files and deleted records are hidden", async () => {
  const owner = await employee(),
    other = await employee(),
    admin = await employee("admin"),
    p = await presentation(owner, 0);
  await assert.rejects(
    prepare(other, p.id),
    (error) => error.message === "file_access_denied",
  );
  const upload = await prepare(admin, p.id);
  await object(upload);
  await complete(admin, upload);
  await db.query(
    "update public.presentations set cancelled_at=now() where id=$1",
    [p.id],
  );
  await prepare(owner, p.id, { expected: upload.id });
  await asEmployee(db, other.authId, async () =>
    assert.equal(
      (await db.query("select * from public.presentation_files")).rows.length,
      1,
    ),
  );
  await db.query(
    "update public.presentations set deleted_at=now() where id=$1",
    [p.id],
  );
  await assert.rejects(
    prepare(admin, p.id, { expected: upload.id }),
    (error) => error.message === "file_access_denied",
  );
  await asEmployee(db, admin.authId, async () =>
    assert.equal(
      (await db.query("select * from public.presentation_files")).rows.length,
      0,
    ),
  );
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
  );
});

test("file publication is server-only; upload intents and direct metadata writes are unavailable to clients", async () => {
  const who = await employee(),
    p = await presentation(who),
    upload = await prepare(who, p.id);
  await object(upload);
  await asEmployee(db, who.authId, async () => {
    for (const sql of [
      "select * from public.presentation_file_uploads",
      `select public.complete_file_upload('${upload.id}','${who.authId}')`,
      "delete from public.presentation_files",
      "update public.presentation_files set object_path='forged'",
    ])
      await assert.rejects(db.query(sql), (error) => error.code === "42501");
  });
  await db.exec("set role anon");
  try {
    await assert.rejects(
      db.query(
        "select public.prepare_file_upload($1,'pdf','a.pdf','application/pdf',100,null)",
        [p.id],
      ),
      (error) => error.code === "42501",
    );
  } finally {
    await db.exec("reset role");
  }
});

test("stale preparations and competing replacements cannot overwrite a saved file", async () => {
  const who = await employee(),
    p = await presentation(who);
  const first = await prepare(who, p.id),
    second = await prepare(who, p.id);
  await object(first);
  await object(second);
  await complete(who, first);
  await assert.rejects(
    complete(who, second),
    (error) => error.message === "file_changed",
  );
  await assert.rejects(
    prepare(who, p.id),
    (error) => error.message === "file_changed",
  );
  assert.equal(
    (await db.query("select id from public.presentation_files")).rows[0].id,
    first.id,
  );
});

test("publication rejects missing or mismatched objects, expiry, validation failures, and a changed caller", async () => {
  const who = await employee(),
    other = await employee(),
    p = await presentation(who),
    upload = await prepare(who, p.id);
  await assert.rejects(
    complete(who, upload),
    (error) => error.message === "file_object_invalid",
  );
  await object(upload, { size: 101 });
  await assert.rejects(
    complete(who, upload),
    (error) => error.message === "file_object_invalid",
  );
  await db.query("update storage.objects set metadata=$1::jsonb", [
    JSON.stringify({ size: 100, mimetype: "application/pdf" }),
  ]);
  await assert.rejects(
    complete(other, upload),
    (error) => error.message === "file_access_denied",
  );
  await db.query(
    "update public.presentation_file_uploads set expires_at=now()-interval '1 minute'",
  );
  await assert.rejects(
    complete(who, upload),
    (error) => error.message === "file_upload_expired",
  );
  await db.query(
    "update public.presentation_file_uploads set expires_at=now()+interval '1 hour',failed_at=now()",
  );
  await assert.rejects(
    complete(who, upload),
    (error) => error.message === "file_upload_expired",
  );
  assert.equal(
    (await db.query("select * from public.presentation_files")).rows.length,
    0,
  );
});

test("permission revocation between upload preparation and completion is enforced independently in SQL", async () => {
  const who = await employee(),
    p = await presentation(who),
    upload = await prepare(who, p.id);
  await object(upload);
  for (const change of [
    "update public.users set is_active=false",
    "update public.users set password_setup_required=true",
    "update auth.users set banned_until=now()+interval '1 hour'",
    "update public.presentations set deleted_at=now()",
  ]) {
    await db.exec(change);
    await assert.rejects(
      complete(who, upload),
      (error) => error.message === "file_access_denied",
    );
    await db.exec(
      "update public.users set is_active=true,password_setup_required=false; update auth.users set banned_until=null; update public.presentations set deleted_at=null",
    );
  }
  await complete(who, upload);
});

test("SQL validates file kinds, MIME, filenames and configurable bucket size at preparation", async () => {
  const who = await employee(),
    p = await presentation(who);
  for (const input of [
    { size: 0 },
    { size: 52428801 },
    { kind: "html" },
    { name: "slides.exe" },
    { name: "../slides.pdf" },
    { mime: "text/html" },
    { name: "x".repeat(201) + ".pdf" },
  ])
    await assert.rejects(
      prepare(who, p.id, input),
      (error) => error.code === "23514",
    );
  await db.exec("update storage.buckets set file_size_limit=99");
  try {
    await assert.rejects(
      prepare(who, p.id),
      (error) => error.message === "file_size_invalid",
    );
  } finally {
    await db.exec("update storage.buckets set file_size_limit=52428800");
  }
  const bucket = (await db.query("select * from storage.buckets")).rows[0];
  assert.equal(bucket.public, false);
  assert.deepEqual(bucket.allowed_mime_types, [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ]);
});
