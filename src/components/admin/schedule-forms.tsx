"use client";

import { useActionState, useId, type ReactNode } from "react";
import { manageSchedule } from "@/app/(workspace)/schedule/manage/actions";
import {
  presentationInputClass,
  adminButtonClass,
} from "@/components/ui/form-styles";
import { formatPresentationDate } from "@/lib/schedule/dates";
import type { AdminResult } from "@/lib/admin/validation";

function ScheduleForm({
  operation,
  label,
  submit,
  children,
}: {
  operation: string;
  label: string;
  submit: string;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState<AdminResult, FormData>(
    manageSchedule,
    {},
  );
  return (
    <form
      action={action}
      aria-label={label}
      onReset={(event) => event.preventDefault()}
      className="space-y-4"
    >
      {state.message && (
        <p
          role="alert"
          className="rounded-lg border border-brand/30 bg-brand-soft p-4 text-sm leading-7 text-brand"
        >
          {state.message}{" "}
          <a
            href=""
            className="inline-flex min-h-11 items-center font-semibold underline"
          >
            Reload latest schedule
          </a>
        </p>
      )}
      <fieldset disabled={pending} className="space-y-4">
        <legend className="sr-only">{label}</legend>
        <input type="hidden" name="operation" value={operation} />
        {children}
        <button type="submit" aria-busy={pending} className={adminButtonClass}>
          {pending ? "Saving…" : submit}
        </button>
      </fieldset>
    </form>
  );
}

function DateField({
  name = "date",
  label,
  value,
  min,
}: {
  name?: string;
  label: string;
  value?: string;
  min?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="date"
        name={name}
        defaultValue={value}
        required
        min={min ?? "0001-01-01"}
        max="9999-12-31"
        className={presentationInputClass}
      />
    </div>
  );
}
function NumberField({ value }: { value?: number }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        Slot number {value === undefined && "(optional)"}
      </label>
      <input
        id={id}
        type="number"
        name="number"
        min={1}
        max={32767}
        step={1}
        required={value !== undefined}
        defaultValue={value}
        className={presentationInputClass}
      />
      {value === undefined && (
        <p className="mt-2 text-sm text-muted">
          Leave blank to use the next number on this date.
        </p>
      )}
    </div>
  );
}

export function CreateSlotForm({ date }: { date: string }) {
  return (
    <ScheduleForm
      operation="create"
      label="Add a presentation slot"
      submit="Add slot"
    >
      <DateField label="Slot date" value={date} />
      <NumberField />
    </ScheduleForm>
  );
}
export function ExtendScheduleForm({
  start,
  end,
  today,
}: {
  start: string;
  end: string;
  today: string;
}) {
  return (
    <ScheduleForm
      operation="extend"
      label="Extend weekly schedule"
      submit="Extend schedule"
    >
      <DateField label="Start date" value={start} min={today} />
      <DateField name="end" label="End date" value={end} min={today} />
    </ScheduleForm>
  );
}
export function CloseDateForm({ date }: { date: string }) {
  return (
    <ScheduleForm
      operation="close"
      label="Close a presentation date"
      submit="Close date"
    >
      <DateField label="Date to close" value={date} />
      <label className="flex min-h-11 items-center gap-3 text-sm leading-6">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          required
          className="size-5 shrink-0 accent-brand"
        />
        I confirm this date should be closed to bookings, including slots added
        later.
      </label>
    </ScheduleForm>
  );
}
export function ReopenDateForm({ date }: { date: string }) {
  return (
    <ScheduleForm
      operation="reopen"
      label={`Reopen ${formatPresentationDate(date)}`}
      submit="Reopen date"
    >
      <input type="hidden" name="date" value={date} />
      <label className="flex min-h-11 items-center gap-3 text-sm leading-6">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          required
          className="size-5 shrink-0 accent-brand"
        />
        Reopen this date. Individually closed slots stay closed.
      </label>
    </ScheduleForm>
  );
}
export function UpdateSlotForm({
  slot,
  dateClosed,
}: {
  slot: {
    id: string;
    revision: number;
    presentation_date: string;
    slot_number: number;
    is_open: boolean;
  };
  dateClosed: boolean;
}) {
  return (
    <ScheduleForm
      operation="update"
      label={`Edit slot ${slot.slot_number} on ${slot.presentation_date}`}
      submit="Save slot"
    >
      <input type="hidden" name="slotId" value={slot.id} />
      <input type="hidden" name="revision" value={slot.revision} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField label="Slot date" value={slot.presentation_date} />
        <NumberField value={slot.slot_number} />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm leading-6">
        <input
          type="checkbox"
          name="open"
          value="yes"
          defaultChecked={slot.is_open}
          className="size-5 shrink-0 accent-brand"
        />
        Open for bookings
      </label>
      {dateClosed && (
        <p className="text-sm leading-7 text-muted">
          This date is closed. The slot remains unavailable until the date is
          reopened, regardless of this setting.
        </p>
      )}
    </ScheduleForm>
  );
}
