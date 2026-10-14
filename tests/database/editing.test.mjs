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
async function employee(role = "user") {
  const authId = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())",
    [authId, `${authId}@example.test`],
  );
  const {
    rows: [row],
  } = await db.query(
    "update public.users set name='Employee',role=$2,password_setup_required=false where auth_user_id=$1 returning id",
    [authId, role],
  );
  return { authId, id: row.id };
}
async function slot(offset = 0, number = 1, open = true) {
  return (
    await db.query(
      "insert into public.presentation_slots(presentation_date,slot_number,is_open) values ((clock_timestamp() at time zone 'America/Vancouver')::date+$1::int,$2,$3) returning id",
      [offset, number, open],
    )
  ).rows[0].id;
}
async function booking(who, slotId) {
  return asEmployee(
    db,
    who.authId,
    async () =>
      (
        await db.query(
          "select public.register_presentation($1,'Original title') as id",
          [slotId],
        )
      ).rows[0].id,
  );
}
async function record(id) {
  return (
    await db.query("select * from public.presentations where id=$1", [id])
  ).rows[0];
}
function edit(
  who,
  id,
  slotId,
  {
    revision = 1,
    title = "Updated title",
    category = null,
    description = null,
    url = null,
  } = {},
) {
  return asEmployee(db, who.authId, () =>
    db.query("select public.update_presentation($1,$2,$3,$4,$5,$6,$7)", [
      id,
      revision,
      slotId,
      title,
      category,
      description,
      url,
    ]),
  );
}
function cancel(who, id, revision = 1, confirm = true) {
  return asEmployee(db, who.authId, () =>
    db.query("select public.cancel_presentation($1,$2,$3)", [
      id,
      revision,
      confirm,
    ]),
  );
}
const rejects = (message) => (error) => error.message === message;

test("same-day editing updates all content, retains authorship, and accepts optional blanks and 500 Unicode characters", async () => {
  const who = await employee(),
    source = await slot(),
    id = await booking(who, source);
  const category = (
    await db.query(
      "insert into public.categories(name) values ('Research') returning id",
    )
  ).rows[0].id;
  await edit(who, id, source, {
    title: "  Revised  ",
    category,
    description: "🔬".repeat(500),
    url: "https://example.test/research",
  });
  let row = await record(id);
  assert.equal(row.title, "Revised");
  assert.equal(row.presenter_user_id, who.id);
  assert.equal(row.category_id, category);
  assert.equal(row.description, "🔬".repeat(500));
  assert.equal(row.reference_url, "https://example.test/research");
  assert.equal(row.revision, 2);
  // An inactive category can be retained without requiring historical metadata changes.
  await db.query("update public.categories set is_active=false where id=$1", [
    category,
  ]);
  await edit(who, id, source, { revision: 2, category });
  await edit(who, id, source, { revision: 3, description: " \n ", url: "  " });
  row = await record(id);
  assert.equal(row.category_id, null);
  assert.equal(row.description, null);
  assert.equal(row.reference_url, null);
  await assert.rejects(
    edit(who, id, source, { revision: 4, category }),
    rejects("category_unavailable"),
  );
});

test("moving to another same-day slot frees only the source, preserves identity and files, and allows a new source booking", async () => {
  const who = await employee(),
    source = await slot(),
    destination = await slot(0, 2),
    id = await booking(who, source);
  await db.query(
    "insert into public.presentation_files(presentation_id,kind,original_filename,mime_type,size_bytes,bucket,object_path,uploaded_by) values ($1,'pdf','slides.pdf','application/pdf',100,'slides',$2,$3)",
    [id, `${id}/slides.pdf`, who.id],
  );
  const original = await record(id);
  await edit(who, id, destination);
  const moved = await record(id);
  assert.equal(moved.slot_id, destination);
  assert.equal(
    moved.created_at.toISOString(),
    original.created_at.toISOString(),
  );
  assert.equal(
    (await db.query("select presentation_id from public.presentation_files"))
      .rows[0].presentation_id,
    id,
  );
  await booking(who, source);
  await assert.rejects(booking(who, destination), rejects("slot_booked"));
});

test("failed moves and invalid metadata roll back both content and slot changes", async () => {
  const who = await employee(),
    source = await slot(),
    id = await booking(who, source);
  const occupied = await slot(1);
  await booking(who, occupied);
  const original = await record(id);
  for (const [target, error] of [
    [occupied, "slot_booked"],
    [await slot(2, 1, false), "slot_closed"],
    [await slot(-1), "slot_past"],
    [randomUUID(), "slot_not_found"],
    [null, "slot_not_found"],
  ]) {
    await assert.rejects(edit(who, id, target), rejects(error));
    assert.deepEqual(await record(id), original);
  }
  const destination = await slot(3);
  for (const [values, error] of [
    [{ title: "\u00a0\u3000" }, "title_required"],
    [{ description: "x".repeat(501) }, "description_too_long"],
    [{ url: "javascript:alert(1)" }, "invalid_reference_url"],
    [{ category: randomUUID() }, "category_unavailable"],
  ]) {
    await assert.rejects(edit(who, id, destination, values), rejects(error));
    assert.deepEqual(await record(id), original);
  }
});

test("cancellation needs confirmation, retains the record and files, releases the slot, and never becomes completed", async () => {
  const who = await employee(),
    source = await slot(),
    id = await booking(who, source);
  await db.query(
    "insert into public.presentation_files(presentation_id,kind,original_filename,mime_type,size_bytes,bucket,object_path,uploaded_by) values ($1,'pdf','slides.pdf','application/pdf',100,'slides',$2,$3)",
    [id, `${id}/slides.pdf`, who.id],
  );
  for (const confirmation of [false, null])
    await assert.rejects(
      cancel(who, id, 1, confirmation),
      rejects("cancellation_confirmation_required"),
    );
  await cancel(who, id);
  const row = await record(id);
  assert.ok(row.cancelled_at);
  assert.equal(row.deleted_at, null);
  assert.equal(row.title, "Original title");
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from public.presentation_files where presentation_id=$1",
        [id],
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select status from public.presentation_overview where id=$1",
        [id],
      )
    ).rows[0].status,
    "cancelled",
  );
  assert.equal(
    (
      await db.query(
        "select public.presentation_status((current_date-1)::date,now()) as status",
      )
    ).rows[0].status,
    "cancelled",
  );
  assert.equal(
    (
      await db.query(
        "select presentation_id from public.schedule_slots where slot_id=$1",
        [source],
      )
    ).rows[0].presentation_id,
    null,
  );
  await booking(who, source);
  await assert.rejects(
    edit(who, id, source, { revision: 2 }),
    rejects("presentation_cancelled"),
  );
  await assert.rejects(cancel(who, id, 2), rejects("presentation_cancelled"));
});

test("closed source slots permit content edits, moves and cancellation without reopening the slot", async () => {
  const who = await employee(),
    source = await slot(),
    destination = await slot(1),
    id = await booking(who, source);
  await db.query(
    "update public.presentation_slots set is_open=false where id=$1",
    [source],
  );
  await edit(who, id, source);
  await edit(who, id, destination, { revision: 2 });
  await db.query(
    "update public.presentation_slots set is_open=false where id=$1",
    [destination],
  );
  await cancel(who, id, 3);
  for (const slotId of [source, destination])
    await assert.rejects(booking(who, slotId), rejects("slot_closed"));
});

test("stale versions cannot overwrite edits, cancel a moved presentation, or restore a cancelled booking", async () => {
  const who = await employee(),
    source = await slot(),
    target = await slot(1),
    id = await booking(who, source);
  await edit(who, id, target);
  await assert.rejects(edit(who, id, source), rejects("presentation_changed"));
  await assert.rejects(cancel(who, id), rejects("presentation_changed"));
  assert.equal((await record(id)).slot_id, target);
  await cancel(who, id, 2);
  await assert.rejects(
    edit(who, id, source, { revision: 2 }),
    rejects("presentation_changed"),
  );
  await assert.rejects(cancel(who, id, null), rejects("presentation_changed"));
});

test("ownership, account state, historical cutoff and soft deletion are enforced by the database", async () => {
  const who = await employee(),
    other = await employee(),
    admin = await employee("admin"),
    source = await slot(),
    id = await booking(who, source);
  await assert.rejects(
    edit(other, id, source),
    rejects("presentation_unavailable"),
  );
  await assert.rejects(cancel(other, id), rejects("presentation_unavailable"));
  await assert.rejects(
    cancel(who, randomUUID()),
    rejects("presentation_unavailable"),
  );
  await edit(admin, id, source); // Existing admin authorization applies to upcoming records.
  for (const change of ["is_active=false", "password_setup_required=true"]) {
    await db.query(`update public.users set ${change} where id=$1`, [who.id]);
    await assert.rejects(
      edit(who, id, source, { revision: 2 }),
      rejects("employee_access_required"),
    );
    await assert.rejects(
      cancel(who, id, 2),
      rejects("employee_access_required"),
    );
    await db.query(
      "update public.users set is_active=true,password_setup_required=false where id=$1",
      [who.id],
    );
  }
  await db.query(
    "update public.presentation_slots set presentation_date=(clock_timestamp() at time zone 'America/Vancouver')::date-1 where id=$1",
    [source],
  );
  for (const person of [who, admin]) {
    await assert.rejects(
      edit(person, id, source, { revision: 2 }),
      rejects("presentation_completed"),
    );
    await assert.rejects(
      cancel(person, id, 2),
      rejects("presentation_completed"),
    );
  }
  await db.query(
    "update public.presentations set deleted_at=now() where id=$1",
    [id],
  );
  await assert.rejects(
    cancel(admin, id, 3),
    rejects("presentation_unavailable"),
  );
  await db.exec("set role anon");
  try {
    await assert.rejects(
      db.query("select public.cancel_presentation($1,3,true)", [id]),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      db.query("select public.update_presentation($1,3,$2,'Title')", [
        id,
        source,
      ]),
      (e) => e.code === "42501",
    );
  } finally {
    await db.exec("reset role");
  }
  await asEmployee(db, who.authId, async () => {
    await assert.rejects(
      db.query(
        "select private.change_upcoming_presentation($1,3,true,null,null,null,null,null)",
        [id],
      ),
      (e) => e.code === "42501",
    );
  });
});
