import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { database } from "./helpers.mjs";

// Real PostgreSQL execution, with only the Supabase-managed identity table and
// request roles stubbed. This does not substitute for Supabase Auth/RLS testing.
let db;
const seed = await readFile(
  new URL("../../supabase/seed.sql", import.meta.url),
  "utf8",
);

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

async function user() {
  const { rows } = await db.query(
    "insert into public.users (name, email) values ('Test Presenter', 'presenter@example.test') returning id",
  );
  return rows[0].id;
}

async function slot(number = 1) {
  const { rows } = await db.query(
    "insert into public.presentation_slots (presentation_date, slot_number) values ('2030-01-01', $1) returning id",
    [number],
  );
  return rows[0].id;
}

async function presentation(userId, slotId) {
  const { rows } = await db.query(
    "insert into public.presentations (presenter_user_id, slot_id, title) values ($1, $2, 'A test presentation') returning id",
    [userId, slotId],
  );
  return rows[0].id;
}

const failsWith = (code) => (error) => error.code === code;

test("seed creates the 12 categories and exactly six months of Tuesdays without employees or presentations", async () => {
  await db.exec(seed);
  const {
    rows: [counts],
  } = await db.query(`
    select
      (select count(*)::int from public.categories) as categories,
      (select count(*)::int from public.users) as users,
      (select count(*)::int from public.presentations) as presentations,
      (select count(*)::int from public.presentation_slots) as slots,
      (select bool_and(extract(isodow from presentation_date) = 2 and slot_number = 1 and is_open)
        from public.presentation_slots) as valid_slots,
      (select min(presentation_date) - (now() at time zone 'America/Vancouver')::date
        from public.presentation_slots) as first_day_offset,
      (select ((now() at time zone 'America/Vancouver')::date + interval '6 months')::date - max(presentation_date)
        from public.presentation_slots) as last_day_offset,
      (select bool_and(gap = 7) from (
        select presentation_date - lag(presentation_date) over (order by presentation_date) as gap
        from public.presentation_slots
      ) as gaps) as weekly_without_gaps
  `);
  assert.equal(counts.categories, 12);
  assert.equal(counts.users, 0);
  assert.equal(counts.presentations, 0);
  assert.ok(counts.slots >= 25 && counts.slots <= 27);
  assert.equal(counts.valid_slots, true);
  assert.ok(counts.first_day_offset >= 0 && counts.first_day_offset < 7);
  assert.ok(counts.last_day_offset > 0 && counts.last_day_offset <= 7);
  assert.equal(counts.weekly_without_gaps, true);
});

test("re-seeding preserves closed dates, bookings, category configuration, and extra same-day slots", async () => {
  await db.exec(seed);
  const {
    rows: [firstSlot],
  } = await db.query(
    "select id, presentation_date from public.presentation_slots order by presentation_date limit 1",
  );
  await db.query(
    "update public.presentation_slots set is_open = false where id = $1",
    [firstSlot.id],
  );
  const userId = await user();
  const {
    rows: [extra],
  } = await db.query(
    "insert into public.presentation_slots (presentation_date, slot_number) values ($1, 2) returning id",
    [firstSlot.presentation_date],
  );
  const presentationId = await presentation(userId, extra.id);
  await db.exec(
    "update public.categories set is_active = false, sort_order = 99 where name = 'Other'",
  );
  const {
    rows: [beforeCounts],
  } = await db.query(
    "select count(*)::int as count from public.presentation_slots",
  );
  await db.exec(seed);
  const {
    rows: [afterCounts],
  } = await db.query(
    "select count(*)::int as count from public.presentation_slots",
  );
  assert.equal(afterCounts.count, beforeCounts.count);
  assert.equal(
    (
      await db.query(
        "select is_open from public.presentation_slots where id = $1",
        [firstSlot.id],
      )
    ).rows[0].is_open,
    false,
  );
  assert.equal(
    (
      await db.query("select id from public.presentations where id = $1", [
        presentationId,
      ])
    ).rows.length,
    1,
  );
  assert.deepEqual(
    (
      await db.query(
        "select is_active, sort_order from public.categories where name = 'Other'",
      )
    ).rows[0],
    { is_active: false, sort_order: 99 },
  );
});

test("each slot allows one booking while a date allows multiple booked slots", async () => {
  const userId = await user();
  const firstSlot = await slot();
  await presentation(userId, firstSlot);
  await assert.rejects(presentation(userId, firstSlot), failsWith("23505"));
  await assert.rejects(slot(), failsWith("23505"));
  await presentation(userId, await slot(2));
  assert.equal(
    (await db.query("select count(*)::int as count from public.presentations"))
      .rows[0].count,
    2,
  );
});

test("cancellation and soft deletion free the slot while retaining every record", async () => {
  const userId = await user();
  const slotId = await slot();
  const cancelledId = await presentation(userId, slotId);
  await db.query(
    "update public.presentations set cancelled_at = now() where id = $1",
    [cancelledId],
  );
  const deletedId = await presentation(userId, slotId);
  await db.query(
    "update public.presentations set deleted_at = now() where id = $1",
    [deletedId],
  );
  await presentation(userId, slotId);
  assert.equal(
    (await db.query("select count(*)::int as count from public.presentations"))
      .rows[0].count,
    3,
  );
  await assert.rejects(
    db.query(
      "update public.presentations set cancelled_at = null where id = $1",
      [cancelledId],
    ),
    failsWith("23505"),
  );
});

test("a failed move to an occupied slot keeps the original booking", async () => {
  const userId = await user();
  const originalSlot = await slot();
  const targetSlot = await slot(2);
  const presentationId = await presentation(userId, originalSlot);
  await presentation(userId, targetSlot);
  await assert.rejects(
    db.query("update public.presentations set slot_id = $1 where id = $2", [
      targetSlot,
      presentationId,
    ]),
    failsWith("23505"),
  );
  assert.equal(
    (
      await db.query("select slot_id from public.presentations where id = $1", [
        presentationId,
      ])
    ).rows[0].slot_id,
    originalSlot,
  );
});

test("required titles, optional fields, description limit, and reference URL scheme are constrained", async () => {
  const presentationId = await presentation(await user(), await slot());
  await db.query(
    "update public.presentations set description = $1 where id = $2",
    ["a".repeat(500), presentationId],
  );
  await assert.rejects(
    db.query("update public.presentations set description = $1 where id = $2", [
      "a".repeat(501),
      presentationId,
    ]),
    failsWith("23514"),
  );
  await assert.rejects(
    db.query("update public.presentations set title = '  ' where id = $1", [
      presentationId,
    ]),
    failsWith("23514"),
  );
  await assert.rejects(
    db.query(
      "update public.presentations set reference_url = 'javascript:alert(1)' where id = $1",
      [presentationId],
    ),
    failsWith("23514"),
  );
  await db.query(
    "update public.presentations set description = null, reference_url = 'https://example.test/paper' where id = $1",
    [presentationId],
  );
});

test("completion uses Vancouver midnight across both daylight-saving transitions", async () => {
  const cases = [
    ["2026-10-04", "2026-10-05T06:59:59Z", "upcoming"],
    ["2026-10-04", "2026-10-05T07:00:00Z", "completed"],
    ["2024-03-10", "2024-03-11T06:59:59Z", "upcoming"],
    ["2024-03-10", "2024-03-11T07:00:00Z", "completed"],
    ["2024-11-03", "2024-11-04T07:59:59Z", "upcoming"],
    ["2024-11-03", "2024-11-04T08:00:00Z", "completed"],
  ];
  await db.exec("set timezone to 'Asia/Tokyo'");
  try {
    for (const [date, instant, expected] of cases) {
      const { rows } = await db.query(
        "select public.presentation_status($1::date, null, $2::timestamptz) as status",
        [date, instant],
      );
      assert.equal(rows[0].status, expected, `${date} at ${instant}`);
    }
    assert.equal(
      (
        await db.query(
          "select public.presentation_status('2020-01-01', now(), now()) as status",
        )
      ).rows[0].status,
      "cancelled",
    );
  } finally {
    await db.exec("set timezone to 'UTC'");
  }
});

test("file metadata enforces one current file per kind; soft deletion preserves files and hides the overview row", async () => {
  const userId = await user();
  const presentationId = await presentation(userId, await slot());
  const insertFile = (path, mime = "application/pdf", bytes = 500) =>
    db.query(
      `
    insert into public.presentation_files
      (presentation_id, kind, bucket, object_path, original_filename, mime_type, size_bytes, uploaded_by)
    values ($1, 'pdf', 'presentation-previews', $2, 'slides.pdf', $3, $4, $5)
  `,
      [presentationId, path, mime, bytes, userId],
    );
  await assert.rejects(
    insertFile("invalid.pdf", "text/html"),
    failsWith("23514"),
  );
  await assert.rejects(
    insertFile("empty.pdf", "application/pdf", 0),
    failsWith("23514"),
  );
  await insertFile("first.pdf");
  await assert.rejects(insertFile("second.pdf"), failsWith("23505"));
  await db.query(
    "update public.presentations set deleted_at = now() where id = $1",
    [presentationId],
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from public.presentation_overview",
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from public.presentation_files",
      )
    ).rows[0].count,
    1,
  );
});

test("employee identity removal preserves authorship and duplicate emails are rejected", async () => {
  const authId = "11111111-1111-4111-8111-111111111111";
  await db.query("insert into auth.users (id) values ($1)", [authId]);
  const userId = await user();
  await db.query("update public.users set auth_user_id = $1 where id = $2", [
    authId,
    userId,
  ]);
  await presentation(userId, await slot());
  await assert.rejects(
    db.exec(
      "insert into public.users (name, email) values ('Other', 'PRESENTER@example.test')",
    ),
    failsWith("23505"),
  );
  await db.query("delete from auth.users where id = $1", [authId]);
  assert.equal(
    (
      await db.query("select auth_user_id from public.users where id = $1", [
        userId,
      ])
    ).rows[0].auth_user_id,
    null,
  );
  await assert.rejects(
    db.query("delete from public.users where id = $1", [userId]),
    (error) =>
      ["23503", "23001"].includes(error.code) &&
      error.constraint === "presentations_presenter_user_id_fkey",
  );
});

test("anonymous and unlinked authenticated identities cannot read internal records", async () => {
  await user();
  const tables = [
    "users",
    "categories",
    "presentation_slots",
    "schedule_date_closures",
    "presentations",
    "presentation_files",
    "presentation_overview",
  ];
  const { rows } = await db.query(
    "select relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'",
  );
  assert.equal(rows.length, 7);
  assert.ok(rows.every((row) => row.relrowsecurity));
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      for (const table of tables) {
        if (role === "anon")
          await assert.rejects(
            db.query(`select * from public.${table}`),
            failsWith("42501"),
          );
        else
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
      }
    } finally {
      await db.exec("reset role");
    }
  }
});
