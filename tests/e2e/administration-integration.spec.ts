import { test, expect, signIn, localSql } from "./admin-fixtures";
import { clientFor, holdSlot, waitForBookings } from "./database-locks";
import {
  adminClient,
  createAccount,
  removeAccount,
  localSupabase,
} from "./fixtures";
import { pdfBytes, powerpointBytes } from "../fixtures/slides";
import { fileTypes, slidesBucket } from "../../src/lib/files/config";
import { addCalendarDays } from "../../src/lib/schedule/dates";

test("date closure and registration serialize in either order without silently cancelling a winning booking", async ({
  account,
  adminDates,
}) => {
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  const other = await createAccount();
  try {
    const admin = await clientFor(account),
      user = await clientFor(other);
    for (const closureFirst of [true, false]) {
      const date = addCalendarDays(adminDates.start, closureFirst ? 0 : 1);
      const { data: id, error } = await admin.rpc("admin_create_slot", {
        p_date: date,
      });
      expect(error).toBeNull();
      const release = await holdSlot(id);
      const close = () =>
        Promise.resolve(
          admin.rpc("admin_set_date_closed", {
            p_date: date,
            p_closed: true,
            p_expected_closed: false,
          }),
        );
      const book = () =>
        Promise.resolve(
          user.rpc("register_presentation", {
            p_slot_id: id,
            p_title: "Concurrent booking",
          }),
        );
      try {
        const first = closureFirst ? close() : book();
        await waitForBookings(
          1,
          closureFirst ? "admin_set_date_closed" : "register_presentation",
        );
        const second = closureFirst ? book() : close();
        await waitForBookings(
          1,
          closureFirst ? "register_presentation" : "admin_set_date_closed",
        );
        await release();
        const results = await Promise.all([first, second]);
        expect(results[0].error).toBeNull();
        expect(results[1].error?.message).toBe(
          closureFirst ? "slot_closed" : "date_has_bookings",
        );
        expect(
          localSql(
            `select count(*) from public.presentations where slot_id='${id}' and cancelled_at is null and deleted_at is null`,
          ),
        ).toBe(closureFirst ? "0" : "1");
      } finally {
        await release();
      }
    }
  } finally {
    await removeAccount(other);
  }
});

test("revoking admin role during a row-lock wait blocks slot edits, closures, historical edits and deletion", async ({
  account,
  slots,
  archive,
}) => {
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  const client = await clientFor(account);
  const s = slots.create(2),
    p = archive.presentation({
      title: `${archive.tag} Revoked admin`,
      offset: -1,
    });
  const source = localSql(
    `select slot_id from public.presentations where id='${p.id}'`,
  );
  const operations = [
    {
      name: "admin_update_slot" as const,
      id: s.id,
      args: {
        p_id: s.id,
        p_revision: 1,
        p_date: s.date,
        p_number: s.number,
        p_open: false,
      },
    },
    {
      name: "admin_set_date_closed" as const,
      id: s.id,
      args: { p_date: s.date, p_closed: true, p_expected_closed: false },
    },
    {
      name: "admin_update_presentation" as const,
      id: source,
      args: {
        p_id: p.id,
        p_revision: 1,
        p_slot_id: source,
        p_presenter_id: account.id,
        p_title: "Unauthorized correction",
      },
    },
    {
      name: "admin_remove_presentation" as const,
      id: source,
      args: {
        p_id: p.id,
        p_revision: 1,
        p_operation: "delete",
        p_confirm: true,
      },
    },
  ];
  for (const operation of operations) {
    const release = await holdSlot(operation.id);
    try {
      const request = Promise.resolve(
        client.rpc(operation.name, operation.args),
      );
      await waitForBookings(1, operation.name);
      localSql(`update public.users set role='user' where id='${account.id}'`);
      await release();
      expect((await request).error?.message).toBe("admin_access_required");
    } finally {
      await release();
      localSql(`update public.users set role='admin' where id='${account.id}'`);
    }
  }
  expect(
    localSql(
      `select title,deleted_at is null,revision from public.presentations where id='${p.id}'`,
    ),
  ).toBe(`${archive.tag} Revoked admin|t|1`);
  expect(
    localSql(
      `select is_open,revision from public.presentation_slots where id='${s.id}'`,
    ),
  ).toBe("t|1");
});

test("concurrent administrative correction and deletion reject the stale mutation", async ({
  account,
  archive,
}) => {
  localSql(`update public.users set role='admin' where id='${account.id}'`);
  const client = await clientFor(account),
    p = archive.presentation({ title: `${archive.tag} Competing admins` });
  const source = localSql(
    `select slot_id from public.presentations where id='${p.id}'`,
  );
  const release = await holdSlot(source);
  try {
    const edit = Promise.resolve(
      client.rpc("admin_update_presentation", {
        p_id: p.id,
        p_revision: 1,
        p_slot_id: source,
        p_presenter_id: account.id,
        p_title: "Winning correction",
      }),
    );
    await waitForBookings(1, "admin_update_presentation");
    const remove = Promise.resolve(
      client.rpc("admin_remove_presentation", {
        p_id: p.id,
        p_revision: 1,
        p_operation: "delete",
        p_confirm: true,
      }),
    );
    await waitForBookings(1, "admin_remove_presentation");
    await release();
    expect((await edit).error).toBeNull();
    expect((await remove).error?.message).toBe("presentation_changed");
    expect(
      localSql(
        `select title,deleted_at is null,revision from public.presentations where id='${p.id}'`,
      ),
    ).toBe("Winning correction|t|2");
  } finally {
    await release();
  }
});

test("UI soft deletion blocks PDF, download, detail, search and pending uploads while retaining both original objects", async ({
  page,
  account,
  archive,
  browser,
}) => {
  // Two sessions, three Storage uploads and repeated authorization checks can
  // exceed the default timeout while the full suite shares the local stack.
  test.setTimeout(60_000);
  const p = archive.presentation({ title: `${archive.tag} Retained files` });
  const other = await createAccount(),
    context = await browser.newContext();
  try {
    await signIn(page, account, `/presentations/${p.id}`);
    for (const kind of ["pdf", "powerpoint"] as const) {
      const type = fileTypes[kind],
        extension = kind === "pdf" ? "pdf" : "pptx";
      await page.getByLabel(`Choose .${extension} file`).setInputFiles({
        name: `Retained.${extension}`,
        mimeType: type.mime,
        buffer: kind === "pdf" ? pdfBytes() : powerpointBytes(),
      });
      await page
        .getByRole("button", {
          name: kind === "pdf" ? "Upload PDF preview" : "Upload PowerPoint",
          exact: true,
        })
        .click();
      await expect(
        page.getByText(`Current: Retained.${extension}`, { exact: false }),
      ).toBeVisible({ timeout: 10_000 });
    }
    const reader = await context.newPage();
    await signIn(reader, other, `/presentations/${p.id}`);
    const base = `/api/presentations/${p.id}/files`;
    for (const kind of ["pdf", "powerpoint"])
      expect((await reader.request.get(`${base}/${kind}`)).status()).toBe(200);
    const origin = { Origin: "http://127.0.0.1:3100" };
    const bytes = pdfBytes("Pending replacement");
    const current = localSql(
      `select id from public.presentation_files where presentation_id='${p.id}' and kind='pdf'`,
    );
    const preparation = await page.request.post(`${base}/uploads`, {
      headers: origin,
      data: {
        kind: "pdf",
        name: "Pending.pdf",
        mime: "application/pdf",
        size: bytes.length,
        expectedFileId: current,
      },
    });
    expect(preparation.status()).toBe(200);
    const upload = (await preparation.json()) as {
      uploadId: string;
      uploadUrl: string;
      mime: string;
    };
    expect(
      (
        await page.request.put(upload.uploadUrl, {
          headers: {
            "Content-Type": upload.mime,
            apikey: localSupabase().PUBLISHABLE_KEY,
          },
          data: bytes,
        })
      ).ok(),
    ).toBe(true);
    localSql(`update public.users set role='admin' where id='${account.id}'`);
    await page.goto(`/presentations/${p.id}/edit`);
    await page
      .getByRole("button", { name: "Delete presentation", exact: true })
      .click();
    await page
      .getByLabel("I confirm that I want to delete this presentation.")
      .check();
    await page
      .getByRole("button", { name: "Confirm deletion", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Presentation deleted.",
    );
    for (const who of [page, reader]) {
      for (const kind of ["pdf", "powerpoint"]) {
        expect((await who.request.get(`${base}/${kind}`)).status()).toBe(404);
        expect((await who.request.head(`${base}/${kind}`)).status()).toBe(404);
      }
      expect(
        (
          await who.request.get(`${base}/pdf`, {
            headers: { Range: "bytes=0-7" },
          })
        ).status(),
      ).toBe(404);
      expect(
        (
          await who.request.post(`${base}/uploads/${upload.uploadId}`, {
            headers: origin,
          })
        ).status(),
      ).toBe(404);
      await who.goto(`/presentations/${p.id}`);
      await expect(
        who.getByRole("heading", { name: "Let’s get you back on track." }),
      ).toBeVisible();
      await expect(who.getByRole("article")).toHaveCount(0);
      await who.goto(`/archive?q=${archive.tag}`);
      await expect(who.getByRole("article")).toHaveCount(0);
    }
    const files = localSql(
      `select object_path from public.presentation_files where presentation_id='${p.id}' order by kind`,
    ).split("\n");
    expect(files).toHaveLength(2);
    for (const path of files)
      expect(
        (await adminClient().storage.from(slidesBucket).info(path)).error,
      ).toBeNull();
  } finally {
    await context.close();
    await removeAccount(other);
  }
});
