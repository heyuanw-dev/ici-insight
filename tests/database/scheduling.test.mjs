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
async function employee({ active = true, setup = false } = {}) {
  const authId = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,encrypted_password) values ($1,$2,now(),'password-hash')",
    [authId, `${authId}@example.test`],
  );
  const {
    rows: [row],
  } = await db.query(
    "insert into public.users(auth_user_id,name,email,is_active,password_setup_required) values ($1,'Test employee',$2,$3,$4) returning id",
    [authId, `${authId}@example.test`, active, setup],
  );
  return { authId, id: row.id };
}
async function slot(offset = 0, number = 1, open = true) {
  const {
    rows: [row],
  } = await db.query(
    "insert into public.presentation_slots(presentation_date,slot_number,is_open) values ((clock_timestamp() at time zone 'America/Vancouver')::date+$1::int,$2,$3) returning id",
    [offset, number, open],
  );
  return row.id;
}
function book(
  who,
  id,
  { title = "A title", category = null, description = null, url = null } = {},
) {
  return asEmployee(
    db,
    who.authId,
    async () =>
      (
        await db.query(
          "select public.register_presentation($1,$2,$3,$4,$5) as id",
          [id, title, category, description, url],
        )
      ).rows[0].id,
  );
}
const rejects = (message) => (error) => error.message === message;

test("booking assigns the verified employee, supports today and multiple same-day slots, and needs only a title", async () => {
  const a = await employee(),
    b = await employee();
  const first = await slot(),
    second = await slot(0, 2),
    future = await slot(1);
  const id = await book(a, first, { title: "  New topic  " });
  await book(b, second);
  await book(a, future);
  const row = (
    await db.query("select * from public.presentations where id=$1", [id])
  ).rows[0];
  assert.equal(row.presenter_user_id, a.id);
  assert.equal(row.title, "New topic");
  for (const key of [
    "category_id",
    "description",
    "reference_url",
    "cancelled_at",
    "deleted_at",
  ])
    assert.equal(row[key], null);
  assert.equal(
    (await db.query("select * from public.presentations")).rows.length,
    3,
  );
  assert.equal(
    (await db.query("select * from public.presentation_files")).rows.length,
    0,
  );
});

test("past, closed, missing, and occupied slots fail without changing any booking", async () => {
  const a = await employee(),
    b = await employee();
  const occupied = await slot();
  await book(a, occupied);
  await assert.rejects(book(b, occupied), rejects("slot_booked"));
  await assert.rejects(book(a, await slot(-1)), rejects("slot_past"));
  await assert.rejects(
    book(a, await slot(1, 1, false)),
    rejects("slot_closed"),
  );
  await assert.rejects(book(a, randomUUID()), rejects("slot_not_found"));
  assert.equal(
    (await db.query("select * from public.presentations")).rows.length,
    1,
  );
});

test("direct RPC input enforces title, 500 characters, HTTP URLs, and active categories", async () => {
  const a = await employee(),
    id = await slot();
  for (const title of [null, "", " \n\t ", "\u00a0\u3000"])
    await assert.rejects(book(a, id, { title }), rejects("title_required"));
  await assert.rejects(
    book(a, id, { description: "a".repeat(501) }),
    rejects("description_too_long"),
  );
  for (const url of [
    "javascript:alert(1)",
    "https://",
    "https:///path",
    "https://user:password@example.test",
    "https://example.test/path space",
    "https://example.test\\path",
  ])
    await assert.rejects(
      book(a, id, { url }),
      rejects("invalid_reference_url"),
    );
  await assert.rejects(
    book(a, id, { category: randomUUID() }),
    rejects("category_unavailable"),
  );
  const category = (
    await db.query(
      "insert into public.categories(name,is_active) values ('Research',false) returning id",
    )
  ).rows[0].id;
  await assert.rejects(
    book(a, id, { category }),
    rejects("category_unavailable"),
  );
  await db.query("update public.categories set is_active=true where id=$1", [
    category,
  ]);
  const presentation = await book(a, id, {
    category,
    description: "🔬".repeat(500),
    url: "https://example.test/paper?q=ai#results",
  });
  assert.equal(
    (
      await db.query(
        "select char_length(description) as length from public.presentations where id=$1",
        [presentation],
      )
    ).rows[0].length,
    500,
  );
});

test("anonymous, unlinked, inactive and unfinished accounts cannot book or read the schedule", async () => {
  const id = await slot();
  for (const person of [
    await employee({ active: false }),
    await employee({ setup: true }),
    { authId: randomUUID() },
  ]) {
    await assert.rejects(book(person, id), rejects("employee_access_required"));
    await asEmployee(db, person.authId, async () =>
      assert.equal(
        (await db.query("select * from public.schedule_slots")).rows.length,
        0,
      ),
    );
  }
  await db.exec("set role anon");
  try {
    await assert.rejects(
      db.query("select public.register_presentation($1,'Title')", [id]),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      db.query("select * from public.schedule_slots"),
      (e) => e.code === "42501",
    );
  } finally {
    await db.exec("reset role");
  }
});

test("cancelled and deleted presentations free open slots without appearing in the schedule; closed bookings stay visible", async () => {
  const a = await employee(),
    ids = [];
  for (const [index, change] of ["cancelled_at", "deleted_at"].entries()) {
    const slotId = await slot(0, index + 1);
    const id = await book(a, slotId);
    ids.push(slotId);
    await db.query(
      `update public.presentations set ${change}=now() where id=$1`,
      [id],
    );
  }
  await asEmployee(db, a.authId, async () => {
    const rows = (await db.query("select * from public.schedule_slots")).rows;
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.presentation_id === null));
  });
  for (const id of ids) await book(a, id);
  await db.query(
    "update public.presentation_slots set is_open=false where id=$1",
    [ids[0]],
  );
  await asEmployee(db, a.authId, async () => {
    const rows = (await db.query("select * from public.schedule_slots")).rows;
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.presentation_id));
    assert.ok(rows.some((row) => !row.is_open));
    for (const sql of [
      "insert into public.presentations(slot_id,presenter_user_id,title) values (gen_random_uuid(),gen_random_uuid(),'Spoof')",
      "update public.presentations set cancelled_at=now()",
      "delete from public.presentations",
      "update public.presentation_slots set is_open=true",
      "update public.schedule_slots set is_open=true",
    ])
      await assert.rejects(
        db.exec(sql),
        (e) =>
          e.code ===
          (sql.includes("update public.schedule_slots") ? "55000" : "42501"),
      );
  });
});
