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
    "truncate public.schedule_date_closures, public.presentation_files, public.presentations, public.presentation_slots, public.categories, public.users, auth.users cascade",
  );
});

const rejects = (message) => (error) => error.message === message;
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
      "insert into public.presentation_slots(presentation_date,slot_number,is_open) values ((clock_timestamp() at time zone 'America/Vancouver')::date+$1::int,$2,$3) returning *",
      [offset, number, open],
    )
  ).rows[0];
}
const call = (who, sql, args = []) =>
  asEmployee(db, who.authId, () => db.query(sql, args));
async function presentation(who, s, cancelled = false) {
  return (
    await db.query(
      "insert into public.presentations(slot_id,presenter_user_id,title,cancelled_at) values ($1,$2,'Original',case when $3 then now() end) returning *",
      [s.id, who.id, cancelled],
    )
  ).rows[0];
}
async function record(id) {
  return (
    await db.query("select * from public.presentations where id=$1", [id])
  ).rows[0];
}
const remove = (who, p, operation = "delete", confirm = true) =>
  call(who, "select public.admin_remove_presentation($1,$2,$3,$4)", [
    p.id,
    p.revision,
    operation,
    confirm,
  ]);
const edit = (who, p, s, presenter, values = {}) =>
  call(
    who,
    "select public.admin_update_presentation($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      p.id,
      p.revision,
      s.id,
      presenter.id,
      values.title ?? "Corrected",
      values.category ?? null,
      values.description ?? null,
      values.url ?? null,
    ],
  );
const closeDate = (who, date, closed = true) =>
  call(who, "select public.admin_set_date_closed($1,$2,$3)", [
    date,
    closed,
    !closed,
  ]);
const updateSlot = (who, s, values = {}) =>
  call(who, "select public.admin_update_slot($1,$2,$3,$4,$5)", [
    s.id,
    s.revision,
    values.date ?? s.presentation_date,
    values.number ?? s.slot_number,
    values.open ?? s.is_open,
  ]);
async function attach(p, who) {
  await db.query(
    "insert into public.presentation_files(presentation_id,kind,bucket,object_path,original_filename,mime_type,size_bytes,uploaded_by) values ($1,'pdf','presentation-slides',$2,'slides.pdf','application/pdf',20,$3)",
    [p.id, `${p.id}/original.pdf`, who.id],
  );
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values ('presentation-slides',$1,'{}')",
    [`${p.id}/original.pdf`],
  );
}

test("admin-only RPCs reject employees and revoked admins; direct writes and anonymous execution remain denied", async () => {
  const regular = await employee(),
    admin = await employee("admin"),
    s = await slot(),
    p = await presentation(regular, s);
  const cases = [
    ["select public.admin_create_slot($1)", [s.presentation_date]],
    ["select public.admin_extend_schedule($1,$1)", [s.presentation_date]],
    [
      "select public.admin_move_presentation_day($1,$1,'[]',true)",
      [s.presentation_date],
    ],
    [
      "select public.admin_update_slot($1,1,$2,1,true)",
      [s.id, s.presentation_date],
    ],
    [
      "select public.admin_set_date_closed($1,true,false)",
      [s.presentation_date],
    ],
    [
      "select public.admin_update_presentation($1,1,$2,$3,'Title')",
      [p.id, s.id, regular.id],
    ],
    ["select public.admin_remove_presentation($1,1,'delete',true)", [p.id]],
  ];
  for (const [sql, args] of cases)
    await assert.rejects(
      call(regular, sql, args),
      rejects("admin_access_required"),
    );
  for (const update of [
    "is_active=false",
    "password_setup_required=true",
    "role='user'",
  ]) {
    await db.query(`update public.users set ${update} where id=$1`, [admin.id]);
    for (const [sql, args] of cases)
      await assert.rejects(
        call(admin, sql, args),
        rejects("admin_access_required"),
      );
    await db.query(
      "update public.users set is_active=true,password_setup_required=false,role='admin' where id=$1",
      [admin.id],
    );
  }
  await db.query(
    "update auth.users set banned_until=now()+interval '1 day' where id=$1",
    [admin.authId],
  );
  for (const [sql, args] of cases)
    await assert.rejects(
      call(admin, sql, args),
      rejects("admin_access_required"),
    );
  await db.query("update auth.users set banned_until=null where id=$1", [
    admin.authId,
  ]);
  for (const who of [regular, admin])
    await asEmployee(db, who.authId, async () => {
      for (const sql of [
        "insert into public.schedule_date_closures values (current_date, now())",
        "update public.presentation_slots set is_open=false",
        "delete from public.presentations",
        "select private.require_schedule_admin()",
      ])
        await assert.rejects(db.exec(sql), (e) => e.code === "42501");
    });
  await db.exec("set role anon");
  try {
    for (const [sql, args] of cases)
      await assert.rejects(db.query(sql, args), (e) => e.code === "42501");
  } finally {
    await db.exec("reset role");
  }
  assert.equal((await record(p.id)).deleted_at, null);
});

test("schedule extension is repeatable and preserves bookings, extra slots, individual closures, and holidays without existing slots", async () => {
  const admin = await employee("admin"),
    who = await employee();
  const {
    rows: [{ start, end, holiday }],
  } = await db.query(
    "select to_char(d,'YYYY-MM-DD') as start,to_char(d+28,'YYYY-MM-DD') as end,to_char(d+7,'YYYY-MM-DD') as holiday from (select (clock_timestamp() at time zone 'America/Vancouver')::date + ((9-extract(isodow from (clock_timestamp() at time zone 'America/Vancouver')::date)::int)%7) as d) t",
  );
  const s = (
    await db.query(
      "insert into public.presentation_slots(presentation_date,slot_number,is_open) values ($1,2,false) returning *",
      [start],
    )
  ).rows[0];
  await presentation(who, s); // Preserve existing state even if it predates closure safeguards.
  await closeDate(admin, holiday);
  assert.equal(
    (
      await call(admin, "select public.admin_extend_schedule($1,$2) as count", [
        start,
        end,
      ])
    ).rows[0].count,
    8,
  );
  assert.equal(
    (
      await call(admin, "select public.admin_extend_schedule($1,$2) as count", [
        start,
        end,
      ])
    ).rows[0].count,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int as n from public.presentation_slots"))
      .rows[0].n,
    9,
  );
  const preserved = (
    await db.query("select * from public.presentation_slots where id=$1", [
      s.id,
    ])
  ).rows[0];
  assert.deepEqual(preserved, s);
  const {
    rows: [closed],
  } = await call(
    who,
    "select * from public.schedule_slots where presentation_date=$1",
    [holiday],
  );
  assert.equal(closed.is_open, false);
  await assert.rejects(
    call(who, "select public.register_presentation($1,'Holiday booking')", [
      closed.slot_id,
    ]),
    rejects("slot_closed"),
  );
  for (const bounds of [
    [end, start],
    [null, end],
    ["-infinity", end],
    [start, "infinity"],
    [start, "9999-12-31"],
    ["2000-01-01", "2000-01-08"],
  ])
    await assert.rejects(
      call(admin, "select public.admin_extend_schedule($1,$2)", bounds),
      rejects("invalid_schedule_range"),
    );
});

test("date closures reject all active bookings; new slots stay closed and reopening preserves individual closures", async () => {
  const admin = await employee("admin"),
    who = await employee(),
    first = await slot(7),
    second = await slot(7, 2, false),
    source = await slot(8),
    p = await presentation(who, first),
    moving = await presentation(who, source);
  await assert.rejects(
    closeDate(admin, first.presentation_date),
    rejects("date_has_bookings"),
  );
  assert.equal((await record(p.id)).cancelled_at, null);
  await remove(admin, p, "cancel");
  await closeDate(admin, first.presentation_date);
  const {
    rows: [{ id: newId }],
  } = await call(admin, "select public.admin_create_slot($1) as id", [
    first.presentation_date,
  ]);
  assert.equal(
    (
      await db.query(
        "select slot_number from public.presentation_slots where id=$1",
        [newId],
      )
    ).rows[0].slot_number,
    3,
  );
  for (const id of [first.id, second.id, newId])
    await assert.rejects(
      call(who, "select public.register_presentation($1,'Attempt')", [id]),
      rejects("slot_closed"),
    );
  await assert.rejects(
    call(who, "select public.update_presentation($1,1,$2,'Move')", [
      moving.id,
      newId,
    ]),
    rejects("slot_closed"),
  );
  await assert.rejects(
    edit(admin, moving, { id: newId }, who),
    rejects("slot_closed"),
  );
  await assert.rejects(
    closeDate(admin, first.presentation_date),
    rejects("date_changed"),
  );
  await closeDate(admin, first.presentation_date, false);
  await call(who, "select public.register_presentation($1,'Reopened')", [
    newId,
  ]);
  await assert.rejects(
    call(who, "select public.register_presentation($1,'Still closed')", [
      second.id,
    ]),
    rejects("slot_closed"),
  );
});

test("slot changes protect history, bookings, numbering and stale forms while allowing empty slots to move", async () => {
  const admin = await employee("admin"),
    who = await employee(),
    empty = await slot(),
    occupied = await slot(1),
    p = await presentation(who, occupied);
  const nextDate = (await slot(2)).presentation_date;
  await updateSlot(admin, empty, { date: nextDate, number: 2, open: false });
  await assert.rejects(updateSlot(admin, empty), rejects("slot_changed"));
  const current = (
    await db.query("select * from public.presentation_slots where id=$1", [
      empty.id,
    ])
  ).rows[0];
  await assert.rejects(
    updateSlot(admin, current, { number: 1 }),
    rejects("slot_number_taken"),
  );
  await assert.rejects(
    updateSlot(admin, occupied, { open: false }),
    rejects("slot_has_booking"),
  );
  await assert.rejects(
    updateSlot(admin, occupied, { date: nextDate }),
    rejects("slot_has_history"),
  );
  await remove(admin, p, "cancel");
  await assert.rejects(
    updateSlot(admin, occupied, { number: 2 }),
    rejects("slot_has_history"),
  );
  await remove(admin, await record(p.id));
  await assert.rejects(
    updateSlot(admin, occupied, { date: nextDate }),
    rejects("slot_has_history"),
  );
  await updateSlot(admin, occupied, { open: false });
  for (const number of [0, -1, 32768])
    await assert.rejects(
      call(admin, "select public.admin_create_slot($1,$2)", [nextDate, number]),
      rejects("invalid_slot_number"),
    );
  for (const date of [null, "infinity", "-infinity", "10000-01-01"])
    await assert.rejects(
      call(admin, "select public.admin_create_slot($1)", [date]),
      rejects("invalid_date"),
    );
});

test("historical corrections change presenter, date and metadata without losing files or identity; regular users still cannot edit history", async () => {
  const admin = await employee("admin"),
    who = await employee(),
    former = await employee(),
    s = await slot(-10),
    target = await slot(-20),
    p = await presentation(who, s);
  await attach(p, who);
  await db.query(
    "update public.users set is_active=false,auth_user_id=null where id=$1",
    [former.id],
  );
  const {
    rows: [category],
  } = await db.query(
    "insert into public.categories(name,is_active) values ('Historical category',false) returning id",
  );
  await assert.rejects(
    call(who, "select public.update_presentation($1,1,$2,'Attempt')", [
      p.id,
      target.id,
    ]),
    rejects("presentation_completed"),
  );
  await assert.rejects(
    edit(who, p, target, who),
    rejects("admin_access_required"),
  );
  await edit(admin, p, target, former, {
    title: "  Historical correction  ",
    category: category.id,
    description: "🔬".repeat(500),
    url: "https://example.test/history",
  });
  const corrected = await record(p.id);
  assert.equal(corrected.title, "Historical correction");
  assert.equal(corrected.presenter_user_id, former.id);
  assert.equal(corrected.slot_id, target.id);
  assert.equal(corrected.description, "🔬".repeat(500));
  assert.equal(corrected.reference_url, "https://example.test/history");
  assert.equal(corrected.created_at.toISOString(), p.created_at.toISOString());
  assert.equal(corrected.revision, 2);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.presentation_files where presentation_id=$1",
        [p.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await call(
        who,
        "select status from public.presentation_overview where id=$1",
        [p.id],
      )
    ).rows[0].status,
    "completed",
  );
  await assert.rejects(edit(admin, p, s, who), rejects("presentation_changed"));
  await assert.rejects(remove(admin, p), rejects("presentation_changed"));
  const future = await slot(1);
  await edit(admin, corrected, future, who);
  assert.equal(
    (
      await call(
        who,
        "select * from public.archive_presentations where id=$1",
        [p.id],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await call(
        who,
        "select status from public.presentation_overview where id=$1",
        [p.id],
      )
    ).rows[0].status,
    "upcoming",
  );
});

test("invalid corrections and occupied/closed destinations leave original bookings unchanged; cancelled corrections never restore bookings", async () => {
  const admin = await employee("admin"),
    who = await employee(),
    s = await slot(-1),
    p = await presentation(who, s),
    occupied = await slot(-2),
    closed = await slot(-3, 1, false),
    target = await slot(-4);
  await presentation(who, occupied);
  for (const [destination, message] of [
    [occupied, "slot_booked"],
    [closed, "slot_closed"],
    [{ id: randomUUID() }, "slot_not_found"],
  ]) {
    await assert.rejects(edit(admin, p, destination, who), rejects(message));
    assert.deepEqual(await record(p.id), p);
  }
  for (const [values, message] of [
    [{ title: "\u00a0\u3000" }, "title_required"],
    [{ description: "x".repeat(501) }, "description_too_long"],
    [{ url: "javascript:alert(1)" }, "invalid_reference_url"],
    [{ category: randomUUID() }, "category_unavailable"],
  ]) {
    await assert.rejects(edit(admin, p, target, who, values), rejects(message));
    assert.deepEqual(await record(p.id), p);
  }
  await assert.rejects(
    edit(admin, p, target, { id: randomUUID() }),
    rejects("presenter_unavailable"),
  );
  await remove(admin, p, "cancel");
  const cancelled = await record(p.id);
  await edit(admin, cancelled, occupied, who);
  const result = await record(p.id);
  assert.ok(result.cancelled_at);
  assert.equal(result.slot_id, occupied.id);
  assert.equal(
    (
      await db.query(
        "select presentation_id from public.schedule_slots where slot_id=$1",
        [occupied.id],
      )
    ).rows[0].presentation_id !== p.id,
    true,
  );
});

test("admin deletion hides all reads and file access but retains records and stored objects, and releases only open future slots", async () => {
  const admin = await employee("admin"),
    who = await employee(),
    future = await slot(5),
    closed = await slot(6, 1, false),
    past = await slot(-1);
  for (const s of [future, closed, past]) {
    const p = await presentation(who, s);
    await attach(p, who);
    for (const confirmation of [false, null])
      await assert.rejects(
        remove(admin, p, "delete", confirmation),
        rejects("confirmation_required"),
      );
    await assert.rejects(
      remove(admin, p, "destroy"),
      rejects("confirmation_required"),
    );
    await remove(admin, p);
    assert.ok((await record(p.id)).deleted_at);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.presentation_files where presentation_id=$1",
          [p.id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from storage.objects where name=$1",
          [`${p.id}/original.pdf`],
        )
      ).rows[0].n,
      1,
    );
    for (const reader of [who, admin])
      await asEmployee(db, reader.authId, async () => {
        for (const table of [
          "presentations",
          "presentation_overview",
          "archive_presentations",
        ])
          assert.equal(
            (
              await db.query(`select * from public.${table} where id=$1`, [
                p.id,
              ])
            ).rows.length,
            0,
          );
        assert.equal(
          (
            await db.query(
              "select * from public.presentation_files where presentation_id=$1",
              [p.id],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.presentation_permissions($1)",
              [p.id],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select presentation_id from public.schedule_slots where slot_id=$1",
              [s.id],
            )
          ).rows[0].presentation_id,
          null,
        );
      });
    await assert.rejects(
      edit(admin, await record(p.id), s, who),
      rejects("presentation_unavailable"),
    );
  }
  await call(
    who,
    "select public.register_presentation($1,'Replacement booking')",
    [future.id],
  );
  await assert.rejects(
    call(who, "select public.register_presentation($1,'Attempt')", [closed.id]),
    rejects("slot_closed"),
  );
  await assert.rejects(
    call(who, "select public.register_presentation($1,'Attempt')", [past.id]),
    rejects("slot_past"),
  );
});

test("admin cancellation includes completed presentations and is distinct from soft deletion", async () => {
  const admin = await employee("admin"),
    who = await employee(),
    s = await slot(-1),
    p = await presentation(who, s);
  await attach(p, who);
  await assert.rejects(
    remove(admin, p, "cancel", false),
    rejects("confirmation_required"),
  );
  await remove(admin, p, "cancel");
  const cancelled = await record(p.id);
  assert.ok(cancelled.cancelled_at);
  assert.equal(cancelled.deleted_at, null);
  assert.equal(
    (
      await call(
        who,
        "select status from public.presentation_overview where id=$1",
        [p.id],
      )
    ).rows[0].status,
    "cancelled",
  );
  assert.equal(
    (
      await call(
        who,
        "select * from public.archive_presentations where id=$1",
        [p.id],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    remove(admin, cancelled, "cancel"),
    rejects("presentation_cancelled"),
  );
  await remove(admin, cancelled);
  assert.ok((await record(p.id)).deleted_at);
});

async function nextWeek() {
  return (
    await db.query(`select to_char(d + 1, 'YYYY-MM-DD') as tuesday,
    to_char(d, 'YYYY-MM-DD') as monday, to_char(d + 6, 'YYYY-MM-DD') as sunday,
    to_char(d + 2, 'YYYY-MM-DD') as wednesday, to_char(d + 7, 'YYYY-MM-DD') as next
    from (select date_trunc('week', (clock_timestamp() at time zone 'America/Vancouver')::date)::date + 7 as d) t`)
  ).rows[0];
}
async function slotsOn(date, count = 2) {
  return (
    await db.query(
      `insert into public.presentation_slots(presentation_date,slot_number)
    select $1, n from generate_series(1,$2::integer) n returning *`,
      [date, count],
    )
  ).rows;
}
async function daySnapshot(date) {
  return (
    await db.query(
      `select s.id,s.revision,p.id as presentation_id from public.presentation_slots s
    left join public.presentations p on p.slot_id=s.id and p.cancelled_at is null and p.deleted_at is null
    where s.presentation_date=$1 order by s.slot_number`,
      [date],
    )
  ).rows;
}
async function moveDay(who, source, target, snapshot, confirm = true) {
  return call(who, "select public.admin_move_presentation_day($1,$2,$3,$4)", [
    source,
    target,
    JSON.stringify(snapshot ?? (await daySnapshot(source))),
    confirm,
  ]);
}

test("a week-day move atomically retains presentations, slides, slot settings and original cancelled/deleted history", async () => {
  const admin = await employee("admin"),
    who = await employee(),
    dates = await nextWeek();
  const [first, second, third] = await slotsOn(dates.tuesday, 3);
  const cancelled = await presentation(who, first, true);
  const deleted = await presentation(who, second);
  await remove(admin, deleted);
  const p = await presentation(who, first),
    q = await presentation(who, second);
  await attach(p, who);
  await updateSlot(admin, third, { open: false });
  await moveDay(admin, dates.tuesday, dates.monday);
  const moved = await record(p.id),
    movedSecond = await record(q.id);
  assert.equal(moved.revision, p.revision + 1);
  assert.equal(movedSecond.revision, q.revision + 1);
  for (const key of [
    "id",
    "title",
    "description",
    "presenter_user_id",
    "category_id",
    "reference_url",
  ])
    assert.equal(moved[key], p[key]);
  assert.notEqual(moved.slot_id, first.id);
  assert.equal((await record(cancelled.id)).slot_id, first.id);
  assert.equal((await record(deleted.id)).slot_id, second.id);
  assert.deepEqual(
    (
      await db.query(
        "select slot_number,is_open from public.presentation_slots where presentation_date=$1 order by slot_number",
        [dates.monday],
      )
    ).rows,
    [
      { slot_number: 1, is_open: true },
      { slot_number: 2, is_open: true },
      { slot_number: 3, is_open: false },
    ],
  );
  assert.deepEqual(
    (
      await db.query(
        "select slot_number,is_open from public.presentation_slots where presentation_date=$1 order by slot_number",
        [dates.tuesday],
      )
    ).rows,
    [
      { slot_number: 1, is_open: false },
      { slot_number: 2, is_open: false },
    ],
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.presentation_files where presentation_id=$1",
        [p.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from storage.objects where name=$1",
        [`${p.id}/original.pdf`],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    edit(admin, p, first, who),
    rejects("presentation_changed"),
  );
  // Moving again is allowed and does not recreate the normal Tuesday slots.
  await moveDay(admin, dates.monday, dates.sunday);
  assert.equal(
    (
      await call(admin, "select public.admin_extend_schedule($1,$2) n", [
        dates.monday,
        dates.sunday,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select to_char(presentation_date,'YYYY-MM-DD') as presentation_date from public.presentation_slots where id=$1",
        [(await record(p.id)).slot_id],
      )
    ).rows[0].presentation_date,
    dates.sunday,
  );
});

test("date moves reject past, cross-week, identical, closed and occupied destinations without partial changes", async () => {
  const admin = await employee("admin"),
    who = await employee(),
    dates = await nextWeek();
  const [first] = await slotsOn(dates.tuesday);
  const p = await presentation(who, first);
  const snapshot = await daySnapshot(dates.tuesday);
  for (const target of [
    null,
    "infinity",
    "-infinity",
    "10000-01-01",
    dates.tuesday,
    dates.next,
  ])
    await assert.rejects(
      moveDay(admin, dates.tuesday, target, snapshot),
      rejects("invalid_week_day"),
    );
  for (const confirm of [false, null])
    await assert.rejects(
      moveDay(admin, dates.tuesday, dates.wednesday, snapshot, confirm),
      rejects("confirmation_required"),
    );
  await assert.rejects(
    moveDay(admin, "2000-01-04", "2000-01-05", []),
    rejects("day_move_past"),
  );
  await closeDate(admin, dates.wednesday);
  await assert.rejects(
    moveDay(admin, dates.tuesday, dates.wednesday, snapshot),
    rejects("day_move_closed"),
  );
  await closeDate(admin, dates.wednesday, false);
  await slotsOn(dates.wednesday, 1);
  await assert.rejects(
    moveDay(admin, dates.tuesday, dates.wednesday, snapshot),
    rejects("day_move_conflict"),
  );
  assert.deepEqual(await record(p.id), p);
  assert.deepEqual(await daySnapshot(dates.tuesday), snapshot);
  assert.equal((await daySnapshot(dates.wednesday)).length, 1);
  await assert.rejects(
    moveDay(admin, dates.monday, dates.sunday, []),
    rejects("day_move_changed"),
  );
});

test("date moves reject stale slot lists, settings, new bookings and cancellations", async () => {
  const admin = await employee("admin"),
    who = await employee(),
    dates = await nextWeek();
  const [first, second] = await slotsOn(dates.tuesday);
  let snapshot = await daySnapshot(dates.tuesday);
  const p = await presentation(who, first);
  await assert.rejects(
    moveDay(admin, dates.tuesday, dates.wednesday, snapshot),
    rejects("day_move_changed"),
  );
  snapshot = await daySnapshot(dates.tuesday);
  await remove(admin, p, "cancel");
  await assert.rejects(
    moveDay(admin, dates.tuesday, dates.wednesday, snapshot),
    rejects("day_move_changed"),
  );
  snapshot = await daySnapshot(dates.tuesday);
  await updateSlot(admin, second, { open: false });
  await assert.rejects(
    moveDay(admin, dates.tuesday, dates.wednesday, snapshot),
    rejects("day_move_changed"),
  );
  snapshot = await daySnapshot(dates.tuesday);
  await call(admin, "select public.admin_create_slot($1)", [dates.tuesday]);
  await assert.rejects(
    moveDay(admin, dates.tuesday, dates.wednesday, snapshot),
    rejects("day_move_changed"),
  );
  await closeDate(admin, dates.tuesday);
  await assert.rejects(
    moveDay(admin, dates.tuesday, dates.wednesday),
    rejects("day_move_closed"),
  );
  assert.equal((await daySnapshot(dates.wednesday)).length, 0);
});

test("seed and extension preserve moved empty weeks, even when only part of a week is requested", async () => {
  const { readFile } = await import("node:fs/promises");
  const admin = await employee("admin"),
    dates = await nextWeek();
  await slotsOn(dates.tuesday);
  await moveDay(admin, dates.tuesday, dates.sunday);
  assert.equal((await daySnapshot(dates.tuesday)).length, 0);
  assert.equal(
    (
      await call(admin, "select public.admin_extend_schedule($1,$1) n", [
        dates.tuesday,
      ])
    ).rows[0].n,
    0,
  );
  await db.exec(
    await readFile(new URL("../../supabase/seed.sql", import.meta.url), "utf8"),
  );
  assert.equal((await daySnapshot(dates.tuesday)).length, 0);
  assert.equal((await daySnapshot(dates.sunday)).length, 2);
});
