import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { mutationIdentity, editingError } from "../../src/lib/schedule/editing";

test("mutation identity requires a canonical presentation UUID and a valid database revision", () => {
  const form = new FormData(),
    id = randomUUID();
  form.set("presentationId", id);
  form.set("revision", "12");
  assert.deepEqual(mutationIdentity(form), { id, revision: 12 });
  for (const revision of [
    "",
    "0",
    "-1",
    "1.5",
    "1e2",
    "NaN",
    "Infinity",
    "2147483648",
    "9007199254740993",
  ]) {
    form.set("revision", revision);
    assert.equal(mutationIdentity(form), null);
  }
  form.set("revision", "1");
  form.set("presentationId", "not-a-presentation");
  assert.equal(mutationIdentity(form), null);
});

test("conflicts distinguish an unchanged booking from an uncertain network result or a stale record", () => {
  assert.match(
    editingError("slot_booked", "23505").errors?.slot ?? "",
    /original booking is unchanged/,
  );
  assert.match(
    editingError("presentation_changed").message ?? "",
    /Reload the latest version/,
  );
  assert.match(
    editingError("presentation_completed").message ?? "",
    /completed in Vancouver/,
  );
  const uncertain = editingError("").message ?? "";
  assert.match(uncertain, /Check the schedule before retrying/);
  assert.doesNotMatch(uncertain, /unchanged/);
});
