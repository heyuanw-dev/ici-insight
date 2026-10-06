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
    "truncate public.presentation_files, public.presentations, public.presentation_slots, public.categories, public.users, auth.users cascade",
  );
});
async function invite({ password = true, confirmed = true } = {}) {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, invited_at, encrypted_password, email_confirmed_at, raw_user_meta_data)
    values ($1, $2, now(), $3, $4, '{"name":"Employee","role":"admin","is_active":true}')`,
    [
      id,
      `${id}@example.test`,
      password ? "a-password-hash" : "",
      confirmed ? new Date().toISOString() : null,
    ],
  );
  if (password && confirmed)
    await db.query(
      "update auth.users set encrypted_password='chosen-password-hash' where id=$1",
      [id],
    );
  return {
    authId: id,
    ...(
      await db.query("select * from public.users where auth_user_id=$1", [id])
    ).rows[0],
  };
}
async function presentation(employee, offset = 0, extra = "") {
  const slot = (
    await db.query(
      `insert into public.presentation_slots (presentation_date, slot_number)
    values ((now() at time zone 'America/Vancouver')::date + $1::int,
      (select count(*)::int+1 from public.presentation_slots)) returning id`,
      [offset],
    )
  ).rows[0].id;
  const row = (
    await db.query(
      `insert into public.presentations (slot_id, presenter_user_id, title)
    values ($1,$2,'Test') returning id`,
      [slot, employee.id],
    )
  ).rows[0];
  if (extra)
    await db.query(`update public.presentations set ${extra} where id=$1`, [
      row.id,
    ]);
  return row.id;
}
async function permissions(employee, id) {
  return asEmployee(
    db,
    employee.authId,
    async () =>
      (
        await db.query("select * from public.presentation_permissions($1)", [
          id,
        ])
      ).rows,
  );
}

test("only invitations provision membership; metadata cannot assign roles; password setup gates access", async () => {
  const id = randomUUID();
  await db.query(
    "insert into auth.users(id,email,encrypted_password) values ($1,'uninvited@example.test','hash')",
    [id],
  );
  assert.equal((await db.query("select * from public.users")).rows.length, 0);
  const employee = await invite({ password: false, confirmed: false });
  assert.equal(employee.role, "user");
  assert.equal(employee.password_setup_required, true);
  await db.exec("insert into public.categories(name) values ('AI')");
  await asEmployee(db, employee.authId, async () => {
    assert.equal((await db.query("select * from public.users")).rows.length, 1);
    assert.equal(
      (await db.query("select * from public.categories")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select private.is_admin() as admin")).rows[0].admin,
      false,
    );
  });
  await db.query(
    "update auth.users set encrypted_password='invitation-random-hash',email_confirmed_at=now() where id=$1",
    [employee.authId],
  );
  assert.equal(
    (
      await db.query(
        "select password_setup_required from public.users where id=$1",
        [employee.id],
      )
    ).rows[0].password_setup_required,
    true,
  );
  await db.query(
    "update auth.users set encrypted_password='set-password-hash' where id=$1",
    [employee.authId],
  );
  await asEmployee(db, employee.authId, async () =>
    assert.equal(
      (await db.query("select * from public.categories")).rows.length,
      1,
    ),
  );
  await db.query(
    "update auth.users set email='new@example.test', raw_user_meta_data='{" +
      '"role":"admin"' +
      "}' where id=$1",
    [employee.authId],
  );
  const updated = (
    await db.query("select * from public.users where id=$1", [employee.id])
  ).rows[0];
  assert.equal(updated.email, "new@example.test");
  assert.equal(updated.role, "user");
});

test("same-day owner edits, historical file access, other presenters, cancellation and deletion have distinct permissions", async () => {
  const owner = await invite(),
    other = await invite();
  const today = await presentation(owner),
    past = await presentation(owner, -1),
    future = await presentation(owner, 1);
  const cancelled = await presentation(owner, 2, "cancelled_at=now()"),
    deleted = await presentation(owner, 3, "deleted_at=now()");
  assert.deepEqual(await permissions(owner, today), [
    { can_edit_metadata: true, can_manage_files: true },
  ]);
  assert.deepEqual(await permissions(owner, future), [
    { can_edit_metadata: true, can_manage_files: true },
  ]);
  assert.deepEqual(await permissions(owner, past), [
    { can_edit_metadata: false, can_manage_files: true },
  ]);
  assert.deepEqual(await permissions(other, today), [
    { can_edit_metadata: false, can_manage_files: false },
  ]);
  assert.deepEqual(await permissions(owner, cancelled), [
    { can_edit_metadata: false, can_manage_files: true },
  ]);
  assert.deepEqual(await permissions(owner, deleted), []);
  await db.query("update public.users set role='admin' where id=$1", [
    other.id,
  ]);
  assert.deepEqual(await permissions(other, past), [
    { can_edit_metadata: true, can_manage_files: true },
  ]);
  await db.query("update public.users set role='user' where id=$1", [other.id]);
  assert.deepEqual(await permissions(other, past), [
    { can_edit_metadata: false, can_manage_files: false },
  ]);
});

test("deactivation, ban, deleted identity, or unconfirmed email revoke reads even with a previously issued identity claim", async () => {
  const employee = await invite(),
    other = await invite();
  const id = await presentation(other);
  const alterations = [
    [
      `update public.users set is_active=false where id=$1`,
      employee.id,
      `update public.users set is_active=true where id=$1`,
    ],
    [
      `update auth.users set banned_until=now()+interval '1 day' where id=$1`,
      employee.authId,
      `update auth.users set banned_until=null where id=$1`,
    ],
    [
      `update auth.users set deleted_at=now() where id=$1`,
      employee.authId,
      `update auth.users set deleted_at=null where id=$1`,
    ],
    [
      `update auth.users set email_confirmed_at=null where id=$1`,
      employee.authId,
      `update auth.users set email_confirmed_at=now() where id=$1`,
    ],
    [
      `update auth.users set is_anonymous=true where id=$1`,
      employee.authId,
      `update auth.users set is_anonymous=false where id=$1`,
    ],
  ];
  for (const [sql, key, undo] of alterations) {
    await db.query(sql, [key]);
    assert.deepEqual(await permissions(employee, id), []);
    await asEmployee(db, employee.authId, async () => {
      assert.equal(
        (await db.query("select * from public.users")).rows.length,
        1,
      ); // Own access-status profile only.
      assert.equal(
        (await db.query("select * from public.presentation_overview")).rows
          .length,
        0,
      );
    });
    await db.query(undo, [key]);
  }
});

test("file metadata and security-invoker overview do not disclose soft-deleted presentations", async () => {
  const employee = await invite();
  for (const deleted of [false, true]) {
    const id = await presentation(
      employee,
      0,
      deleted ? "deleted_at=now()" : "",
    );
    await db.query(
      `insert into public.presentation_files(presentation_id,kind,bucket,object_path,original_filename,mime_type,size_bytes,uploaded_by)
      values($1,'pdf','presentation-previews',$2,'slides.pdf','application/pdf',10,$3)`,
      [id, `${id}/slides.pdf`, employee.id],
    );
  }
  await asEmployee(db, employee.authId, async () => {
    for (const table of [
      "presentations",
      "presentation_overview",
      "presentation_files",
    ])
      assert.equal(
        (await db.query(`select * from public.${table}`)).rows.length,
        1,
      );
  });
});

test("employees cannot promote/reactivate themselves; all unfinished business writes stay denied for admins too", async () => {
  const employee = await invite();
  for (const role of ["user", "admin"]) {
    await db.query("update public.users set role=$1 where id=$2", [
      role,
      employee.id,
    ]);
    await asEmployee(db, employee.authId, async () => {
      for (const sql of [
        "update public.users set role='admin',is_active=true",
        "insert into public.categories(name) values ('Hidden')",
        "delete from public.presentation_slots",
        "update public.presentations set title='Changed'",
        "delete from public.presentation_files",
        "select private.sync_invited_employee()",
      ])
        await assert.rejects(db.exec(sql), (error) => error.code === "42501");
    });
  }
});
