import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { asEmployee, database } from "./helpers.mjs";

const migrationName = "20261013000000_auth_user_synchronization.sql";
const migration = await readFile(
  new URL(`../../supabase/migrations/${migrationName}`, import.meta.url),
  "utf8",
);
const previousMigration = "20261012000000_weekly_schedule.sql";
let db;
before(async () => {
  db = await database();
});
after(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("truncate public.users, auth.users cascade");
});
const profile = async (connection, id) =>
  (
    await connection.query("select * from public.users where auth_user_id=$1", [
      id,
    ])
  ).rows[0];

test("manual email accounts use the Auth UUID, safe name fallbacks and employee defaults", async () => {
  const cases = [
    [{ name: "  Named Employee  ", full_name: "Ignored" }, "Named Employee"],
    [{ name: " ", full_name: "  Full Name  " }, "Full Name"],
    [{ name: { unsafe: true }, full_name: 42 }, "employee"],
    [{}, "employee"],
  ];
  for (const [metadata, expectedName] of cases) {
    const id = randomUUID();
    const email = `employee@${id}.example.test`;
    await db.query(
      `insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)
       values($1,$2,'hash',now(),$3)`,
      [
        id,
        `  ${email}  `,
        JSON.stringify({
          ...metadata,
          role: "admin",
          is_active: false,
          password_setup_required: true,
        }),
      ],
    );
    const row = await profile(db, id);
    assert.equal(row.id, id);
    assert.equal(row.email, email);
    assert.equal(row.name, expectedName);
    assert.equal(row.role, "user");
    assert.equal(row.is_active, true);
    assert.equal(row.password_setup_required, true);
    await asEmployee(db, id, async () => {
      assert.equal(
        (await db.query("select private.current_employee_id() as id")).rows[0]
          .id,
        null,
      );
    });
    await db.query(
      "update auth.users set encrypted_password='chosen-password-hash' where id=$1",
      [id],
    );
    await asEmployee(db, id, async () => {
      assert.equal(
        (await db.query("select private.current_employee_id() as id")).rows[0]
          .id,
        id,
      );
      assert.equal(
        (await db.query("select private.is_admin() as admin")).rows[0].admin,
        false,
      );
    });
  }
  const columns = (
    await db.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='users'",
    )
  ).rows.map((r) => r.column_name);
  assert.ok(
    !columns.includes("password") && !columns.includes("encrypted_password"),
  );
});

test("repeated synchronization preserves existing names, administrator roles and inactive status", async () => {
  const id = randomUUID();
  await db.query(
    "insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,'admin@example.test','hash',now())",
    [id],
  );
  await db.query(
    "update public.users set name='Existing name',role='admin',is_active=false,password_setup_required=true where id=$1",
    [id],
  );
  for (let i = 0; i < 2; i++) {
    await db.query(
      `update auth.users set email='new-admin@example.test',raw_user_meta_data='{"name":"Replaced","role":"user","is_active":true,"password_setup_required":false}' where id=$1`,
      [id],
    );
  }
  const row = await profile(db, id);
  assert.equal(row.email, "new-admin@example.test");
  assert.equal(row.name, "Existing name");
  assert.equal(row.role, "admin");
  assert.equal(row.is_active, false);
  assert.equal(row.password_setup_required, true);
  assert.equal((await db.query("select * from public.users")).rows.length, 1);
  await db.query(
    "update auth.users set encrypted_password='new-hash' where id=$1",
    [id],
  );
  const changed = await profile(db, id);
  assert.equal(changed.password_setup_required, false);
  assert.equal(changed.role, "admin");
  assert.equal(changed.is_active, false);
});

test("passwordless provisioned accounts remain gated until password setup after confirmation", async () => {
  const id = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'passwordless@example.test',now())",
    [id],
  );
  assert.equal((await profile(db, id)).password_setup_required, true);
  await asEmployee(db, id, async () => {
    assert.equal(
      (await db.query("select private.current_employee_id() as id")).rows[0].id,
      null,
    );
  });
  await db.query(
    "update auth.users set encrypted_password='chosen-hash' where id=$1",
    [id],
  );
  assert.equal((await profile(db, id)).password_setup_required, false);
});

test("non-email, anonymous and deleted accounts are excluded; UUID and email collisions fail atomically", async () => {
  await db.exec(`insert into auth.users(id,email,is_anonymous,deleted_at) values
    (gen_random_uuid(),null,false,null),
    (gen_random_uuid(),'  ',false,null),
    (gen_random_uuid(),'anonymous@example.test',true,null),
    (gen_random_uuid(),'deleted@example.test',false,now())`);
  assert.equal((await db.query("select * from public.users")).rows.length, 0);
  const retainedId = randomUUID();
  await db.query(
    "insert into public.users(id,name,email,role) values($1,'Retained admin','retained@example.test','admin')",
    [retainedId],
  );
  const newId = randomUUID();
  await assert.rejects(
    db.query(
      "insert into auth.users(id,email) values($1,'RETAINED@example.test')",
      [newId],
    ),
    (error) => error.code === "23505",
  );
  assert.equal(
    (await db.query("select * from auth.users where id=$1", [newId])).rows
      .length,
    0,
  );
  assert.equal(
    (
      await db.query("select auth_user_id,role from public.users where id=$1", [
        retainedId,
      ])
    ).rows[0].auth_user_id,
    null,
  );
  const id = randomUUID();
  await db.query(
    "insert into auth.users(id,email) values($1,'valid@example.test')",
    [id],
  );
  await assert.rejects(
    db.query("update public.users set id=$1 where auth_user_id=$2", [
      randomUUID(),
      id,
    ]),
    (error) => error.constraint === "users_auth_identity_matches",
  );
});

test("migration backfills missing profiles and aligns legacy ownership without changing roles, state or stored files", async () => {
  const adminId = randomUUID(),
    legacyId = randomUUID(),
    manualId = randomUUID(),
    inviteId = randomUUID(),
    inactiveId = randomUUID();
  let retainedId, presentationId, fileId, uploadId, oldProfile, inactiveProfile;
  const upgraded = await database({
    beforeMigration: async (connection, name) => {
      if (name !== migrationName) return;
      await connection.query(
        `insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
      ($1,'legacy-admin@example.test','hash',now(),'{"name":"New name","role":"user"}'),
      ($2,'missing-manual@example.test','hash',now(),'{"full_name":"Backfilled Employee","role":"admin"}')`,
        [adminId, manualId],
      );
      await connection.query(
        `insert into public.users(id,auth_user_id,name,email,role,password_setup_required,created_at)
      values($1,$2,'Original administrator','legacy-admin@example.test','admin',false,'2025-01-01')`,
        [legacyId, adminId],
      );
      oldProfile = await profile(connection, adminId);
      await connection.query(
        `insert into auth.users(id,email,invited_at,encrypted_password,email_confirmed_at)
      values($1,'missing-invite@example.test',now(),'invite-random-hash',now()),
      ($2,'inactive@example.test',now(),null,null)`,
        [inviteId, inactiveId],
      );
      await connection.query("delete from public.users where auth_user_id=$1", [
        inviteId,
      ]);
      await connection.query(
        "update public.users set is_active=false where auth_user_id=$1",
        [inactiveId],
      );
      inactiveProfile = await profile(connection, inactiveId);
      retainedId = (
        await connection.query(
          "insert into public.users(name,email,role,is_active) values('Former employee','former@example.test','admin',false) returning id",
        )
      ).rows[0].id;
      const slotId = (
        await connection.query(
          "insert into public.presentation_slots(presentation_date,slot_number) values('2025-01-07',1) returning id",
        )
      ).rows[0].id;
      presentationId = (
        await connection.query(
          "insert into public.presentations(slot_id,presenter_user_id,title,deleted_at) values($1,$2,'Retained history',now()) returning id",
          [slotId, legacyId],
        )
      ).rows[0].id;
      fileId = (
        await connection.query(
          `insert into public.presentation_files(presentation_id,uploaded_by,kind,bucket,object_path,original_filename,mime_type,size_bytes)
      values($1,$2,'pdf','presentation-slides',$3,'slides.pdf','application/pdf',100) returning id`,
          [presentationId, legacyId, `${presentationId}/existing.pdf`],
        )
      ).rows[0].id;
      uploadId = (
        await connection.query(
          `insert into public.presentation_file_uploads(presentation_id,uploaded_by,kind,object_path,original_filename,mime_type,size_bytes)
      values($1,$2,'pdf',$3,'pending.pdf','application/pdf',100) returning id`,
          [presentationId, legacyId, `${presentationId}/pending.pdf`],
        )
      ).rows[0].id;
      await connection.exec(`insert into auth.users(id,email,is_anonymous,deleted_at) values
      (gen_random_uuid(),null,false,null),
      (gen_random_uuid(),'anonymous@example.test',true,null),
      (gen_random_uuid(),'deleted@example.test',false,now())`);
    },
  });
  try {
    for (const [id, original] of [
      [adminId, oldProfile],
      [inactiveId, inactiveProfile],
    ]) {
      const row = await profile(upgraded, id);
      assert.equal(row.id, id);
      for (const field of [
        "auth_user_id",
        "name",
        "email",
        "role",
        "is_active",
        "password_setup_required",
        "created_at",
      ])
        assert.deepEqual(row[field], original[field], field);
    }
    const manual = await profile(upgraded, manualId);
    assert.equal(manual.id, manualId);
    assert.equal(manual.name, "Backfilled Employee");
    assert.equal(manual.role, "user");
    assert.equal(manual.password_setup_required, true);
    assert.equal(
      (await profile(upgraded, inviteId)).password_setup_required,
      true,
    );
    const retained = (
      await upgraded.query("select * from public.users where id=$1", [
        retainedId,
      ])
    ).rows[0];
    assert.equal(retained.auth_user_id, null);
    assert.equal(retained.role, "admin");
    assert.equal(retained.is_active, false);
    assert.equal(
      (await upgraded.query("select * from public.users")).rows.length,
      5,
    );
    const presentation = (
      await upgraded.query("select * from public.presentations where id=$1", [
        presentationId,
      ])
    ).rows[0];
    assert.equal(presentation.presenter_user_id, adminId);
    assert.equal(presentation.title, "Retained history");
    assert.ok(presentation.deleted_at);
    for (const [table, id, path] of [
      ["presentation_files", fileId, "existing.pdf"],
      ["presentation_file_uploads", uploadId, "pending.pdf"],
    ]) {
      const file = (
        await upgraded.query(`select * from public.${table} where id=$1`, [id])
      ).rows[0];
      assert.equal(file.uploaded_by, adminId);
      assert.equal(file.presentation_id, presentationId);
      assert.equal(file.object_path, `${presentationId}/${path}`);
    }
    await asEmployee(upgraded, adminId, async () => {
      assert.equal(
        (await upgraded.query("select private.is_admin() as admin")).rows[0]
          .admin,
        true,
      );
    });
    // Later Auth updates must not duplicate backfilled profiles or downgrade admins.
    await upgraded.exec("update auth.users set email=email");
    assert.equal(
      (await upgraded.query("select * from public.users")).rows.length,
      5,
    );
    assert.equal((await profile(upgraded, adminId)).role, "admin");
  } finally {
    await upgraded.close();
  }
});

for (const conflict of ["email", "identity"]) {
  test(`migration aborts and rolls back on a ${conflict} conflict without linking retained administrator accounts`, async () => {
    const legacy = await database({ throughMigration: previousMigration });
    try {
      const id = randomUUID();
      await legacy.query(
        "insert into auth.users(id,email) values($1,'conflict@example.test')",
        [id],
      );
      await legacy.query(
        "insert into public.users(id,name,email,role) values($1,'Retained admin',$2,'admin')",
        [
          conflict === "identity" ? id : randomUUID(),
          conflict === "email" ? "CONFLICT@example.test" : "other@example.test",
        ],
      );
      await assert.rejects(
        legacy.exec(migration),
        (error) => error.message === `auth_sync_${conflict}_conflict`,
      );
      await legacy.exec("rollback");
      const users = (
        await legacy.query("select role,auth_user_id from public.users")
      ).rows;
      assert.deepEqual(users, [{ role: "admin", auth_user_id: null }]);
      assert.equal(
        (
          await legacy.query(
            "select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal",
          )
        ).rows[0].tgname,
        "sync_invited_employee",
      );
    } finally {
      await legacy.close();
    }
  });
}
