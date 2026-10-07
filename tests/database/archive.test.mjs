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

async function employee(name = "Researcher") {
  const authId = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())",
    [authId, `${authId}@example.test`],
  );
  const {
    rows: [row],
  } = await db.query(
    "insert into public.users(auth_user_id,name,email,password_setup_required) values ($1,$2,$3,false) returning id",
    [authId, name, `${authId}@example.test`],
  );
  return { authId, id: row.id };
}
async function category(name, active = true) {
  return (
    await db.query(
      "insert into public.categories(name,is_active) values ($1,$2) returning id",
      [name, active],
    )
  ).rows[0].id;
}
async function presentation(
  who,
  {
    offset = -1,
    date,
    number = 1,
    title = "Presentation",
    description = null,
    category = null,
    cancelled = false,
    deleted = false,
    open = true,
  } = {},
) {
  const slot = (
    await db.query(
      "insert into public.presentation_slots(presentation_date,slot_number,is_open) values (coalesce($1::date,(now() at time zone 'America/Vancouver')::date+$2::int),$3,$4) returning id",
      [date ?? null, offset, number, open],
    )
  ).rows[0].id;
  return (
    await db.query(
      "insert into public.presentations(slot_id,presenter_user_id,title,description,category_id,cancelled_at,deleted_at) values ($1,$2,$3,$4,$5,case when $6 then now() end,case when $7 then now() end) returning id",
      [slot, who.id, title, description, category, cancelled, deleted],
    )
  ).rows[0].id;
}
async function search(
  who,
  {
    q = "",
    presenter = null,
    category = null,
    year = null,
    from = null,
    to = null,
  } = {},
) {
  return asEmployee(
    db,
    who.authId,
    async () =>
      (
        await db.query(
          "select * from public.search_archive($1,$2,$3,$4,$5,$6)",
          [q, presenter, category, year, from, to],
        )
      ).rows,
  );
}
async function options(who) {
  return asEmployee(
    db,
    who.authId,
    async () =>
      (await db.query("select * from public.archive_filter_options()")).rows,
  );
}

test("archive contains only completed visible records, newest first with deterministic same-day slots, regardless of missing slides or closures", async () => {
  const who = await employee();
  const older = await presentation(who, { offset: -10 });
  const newestSecond = await presentation(who, { number: 2 });
  const newestFirst = await presentation(who, { number: 1, open: false });
  await presentation(who, { offset: 0 });
  await presentation(who, { offset: 1 });
  await presentation(who, { offset: -2, cancelled: true });
  await presentation(who, { offset: -3, deleted: true });
  for (const timezone of ["UTC", "Asia/Tokyo", "Pacific/Honolulu"]) {
    await db.query("select set_config('TimeZone',$1,false)", [timezone]);
    const result = await search(who);
    assert.deepEqual(
      result.map((row) => row.id),
      [newestFirst, newestSecond, older],
    );
    assert.ok(
      result.every(
        (row) =>
          row.status === "completed" &&
          row.powerpoint_file_id === null &&
          row.pdf_file_id === null,
      ),
    );
  }
  await db.exec("set time zone 'UTC'");
});

test("search supports case-insensitive partial words across all four fields, with AND semantics and literal punctuation", async () => {
  const who = await employee("Ada Lovelace"),
    other = await employee("Grace Hopper"),
    cat = await category("Computer Vision");
  const id = await presentation(who, {
    title: "Diffusion 100%_precision",
    description: "A robot learns navigation",
    category: cat,
  });
  await presentation(other, { offset: -2, title: "Other research" });
  for (const q of [
    "DIFFUS",
    "LOVEL",
    "navig",
    "Visi",
    "diffus ada robot",
    "100%_",
    "%",
    "_",
  ])
    assert.deepEqual(
      (await search(other, { q })).map((row) => row.id),
      [id],
      q,
    );
  assert.equal((await search(other, { q: "diffusion absentword" })).length, 0);
  for (const q of [
    "%_nonexistent",
    "' OR true --",
    "title.ilike.*",
    "(id.not.is.null)",
  ])
    assert.equal((await search(other, { q })).length, 0);
  await db.query("update public.categories set name='视觉模型' where id=$1", [
    cat,
  ]);
  assert.deepEqual(
    (await search(other, { q: "视觉" })).map((row) => row.id),
    [id],
  );
  assert.equal((await search(other, { q: "Computer Vision" })).length, 0);
});

test("presenter/category/year and inclusive date ranges combine; null categories remain visible without a category filter", async () => {
  const who = await employee(),
    other = await employee(),
    cat = await category("Agents");
  const leap = await presentation(who, { date: "2024-02-29", category: cat });
  await presentation(other, { date: "2024-02-28", category: cat });
  await presentation(who, { date: "2023-12-31", category: cat });
  const uncategorized = await presentation(who, { date: "2024-03-01" });
  assert.deepEqual(
    (
      await search(who, {
        presenter: who.id,
        category: cat,
        year: 2024,
        from: "2024-02-29",
        to: "2024-02-29",
      })
    ).map((row) => row.id),
    [leap],
  );
  assert.equal(
    (await search(who, { presenter: other.id, year: 2024 })).length,
    1,
  );
  assert.equal((await search(who, { category: cat })).length, 3);
  assert.equal((await search(who, { year: 2025 })).length, 0);
  assert.deepEqual(
    (await search(who, { from: "2024-03-01" })).map((row) => row.id),
    [uncategorized],
  );
  assert.equal((await search(who, { to: "2024-02-29" })).length, 3);
  assert.equal((await search(who, { presenter: randomUUID() })).length, 0);
});

test("filter options retain former presenters and inactive categories, but never derive from hidden or upcoming records", async () => {
  const reader = await employee(),
    former = await employee("Former presenter"),
    hidden = await employee("Hidden-only presenter");
  const retainedCategory = await category("Legacy category", false),
    hiddenCategory = await category("Hidden category");
  await presentation(former, {
    date: "2022-01-01",
    category: retainedCategory,
  });
  await presentation(hidden, {
    date: "2021-01-01",
    category: hiddenCategory,
    deleted: true,
  });
  await presentation(hidden, {
    date: "2020-01-01",
    category: hiddenCategory,
    cancelled: true,
  });
  await presentation(hidden, { offset: 2, category: hiddenCategory });
  await db.query("update public.users set is_active=false where id=$1", [
    former.id,
  ]);
  await db.query("delete from auth.users where id=$1", [former.authId]);
  const result = await options(reader);
  assert.deepEqual(
    result
      .filter((row) => row.filter_type === "presenter")
      .map((row) => row.value),
    [former.id],
  );
  assert.deepEqual(
    result
      .filter((row) => row.filter_type === "category")
      .map((row) => row.value),
    [retainedCategory],
  );
  assert.deepEqual(
    result.filter((row) => row.filter_type === "year").map((row) => row.value),
    ["2022"],
  );
  assert.equal((await search(reader, { presenter: former.id })).length, 1);
});

test("file availability is metadata only and soft deletion removes records from search and options", async () => {
  const who = await employee(),
    id = await presentation(who);
  const file = (
    await db.query(
      "insert into public.presentation_files(presentation_id,kind,bucket,object_path,original_filename,mime_type,size_bytes,uploaded_by) values ($1,'pdf','private-slides',$2,'slides.pdf','application/pdf',100,$3) returning id",
      [id, `${id}/slides.pdf`, who.id],
    )
  ).rows[0].id;
  let result = await search(who);
  assert.equal(result[0].pdf_file_id, file);
  assert.equal(result[0].powerpoint_file_id, null);
  assert.equal("object_path" in result[0], false);
  await db.query(
    "update public.presentations set deleted_at=now() where id=$1",
    [id],
  );
  result = await search(who);
  assert.equal(result.length, 0);
  assert.equal((await options(who)).length, 0);
  assert.equal(
    (await db.query("select id from public.presentation_files")).rows.length,
    1,
  );
});

test("archive reads fail closed for anonymous, unlinked, inactive, banned, and unfinished accounts", async () => {
  const who = await employee();
  await presentation(who);
  await db.exec("set role anon");
  try {
    for (const sql of [
      "select * from public.archive_presentations",
      "select * from public.search_archive()",
      "select * from public.archive_filter_options()",
    ])
      await assert.rejects(db.query(sql), (error) => error.code === "42501");
  } finally {
    await db.exec("reset role");
  }
  for (const change of [
    "update public.users set is_active=false",
    "update public.users set password_setup_required=true",
    "update auth.users set banned_until=now()+interval '1 hour'",
  ]) {
    await db.exec(change);
    await assert.rejects(
      search(who),
      (error) => error.message === "employee_access_required",
    );
    assert.equal((await options(who)).length, 0);
    await asEmployee(db, who.authId, async () =>
      assert.equal(
        (await db.query("select * from public.archive_presentations")).rows
          .length,
        0,
      ),
    );
    await db.exec(
      "update public.users set is_active=true,password_setup_required=false; update auth.users set banned_until=null",
    );
  }
  await assert.rejects(
    search({ authId: randomUUID() }),
    (error) => error.message === "employee_access_required",
  );
});

test("database validates direct RPC search input and leaves historical mutations unavailable", async () => {
  const who = await employee(),
    id = await presentation(who);
  for (const [filter, message] of [
    [{ q: "a".repeat(201) }, "archive_query_too_long"],
    [{ year: 0 }, "archive_invalid_year"],
    [{ year: 10000 }, "archive_invalid_year"],
    [{ from: "2024-02-01", to: "2024-01-01" }, "archive_invalid_date_range"],
    [{ from: "-infinity" }, "archive_invalid_date"],
    [{ to: "infinity" }, "archive_invalid_date"],
  ])
    await assert.rejects(
      search(who, filter),
      (error) => error.message === message,
    );
  await asEmployee(db, who.authId, async () => {
    const permissions = (
      await db.query("select * from public.presentation_permissions($1)", [id])
    ).rows[0];
    assert.equal(permissions.can_edit_metadata, false);
    assert.equal(permissions.can_manage_files, true);
    await assert.rejects(
      db.query("update public.presentations set title='Changed' where id=$1", [
        id,
      ]),
      (error) => error.code === "42501",
    );
    await assert.rejects(
      db.query("select public.cancel_presentation($1,1,true)", [id]),
      (error) => error.message === "presentation_completed",
    );
  });
});
