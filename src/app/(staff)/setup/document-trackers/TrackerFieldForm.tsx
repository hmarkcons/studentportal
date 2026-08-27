"use client";

import { useActionState, useState } from "react";
import { createTrackerField, updateTrackerField, deleteTrackerField } from "@/lib/actions/countryTracker";
import { TRACKER_FIELD_TYPES, type TrackerFieldDef } from "@/lib/countryTrackers";

const inputClass = "rounded-md border border-border bg-card px-2 py-1.5 text-sm";

const TYPE_HELP: Record<string, string> = {
  select: "Options: comma-separated list (leave blank to auto-fill from the student's applied universities in this country).",
  multi_select: "Options: comma-separated checkbox list.",
  multi_university_status: "Options: comma-separated status choices (e.g. Pending,Booked,Rejected). Set 'Date shown when status is' to reveal a date per row.",
  credential: "Set the credential type (e.g. gmail, university_portal).",
  text: "No options needed.",
  textarea: "No options needed.",
  number: "No options needed.",
  date: "No options needed.",
  boolean: "No options needed.",
  multi_text: "No options needed — staff type free-form entries.",
};

export function NewTrackerFieldForm({ countryCode }: { countryCode: string }) {
  const [state, formAction, pending] = useActionState(createTrackerField, undefined);
  const [fieldType, setFieldType] = useState("text");

  return (
    <form action={formAction} className="grid grid-cols-1 gap-2 rounded-md border border-dashed border-border p-3 sm:grid-cols-3">
      <input type="hidden" name="country_code" value={countryCode} />
      <label className="flex flex-col gap-1 text-xs text-muted">
        Field key (lowercase_snake_case)
        <input name="field_key" required pattern="[a-z][a-z0-9_]*" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Label
        <input name="label" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <select name="field_type" value={fieldType} onChange={(e) => setFieldType(e.target.value)} className={inputClass}>
          {TRACKER_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
        Options {TYPE_HELP[fieldType]}
        <input name="options" placeholder="Option A, Option B, Option C" className={inputClass} />
      </label>
      {fieldType === "credential" && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Credential type
          <input name="credential_type" className={inputClass} />
        </label>
      )}
      {fieldType === "multi_university_status" && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Date shown when status is
          <input name="date_when_status" placeholder="e.g. Booked" className={inputClass} />
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Only show when field key…
        <input name="show_if_key" placeholder="e.g. finalized_university" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        …equals (or * for "any value")
        <input name="show_if_equals" placeholder="e.g. Booked or *" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Sort order
        <input name="sort_order" type="number" defaultValue={100} className={inputClass} />
      </label>
      <div className="col-span-full">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Adding…" : "+ Add field"}
        </button>
        {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      </div>
    </form>
  );
}

export function TrackerFieldRow({ field }: { field: TrackerFieldDef }) {
  const [editing, setEditing] = useState(false);
  const action = updateTrackerField.bind(null, field.id!);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [fieldType, setFieldType] = useState(field.type);

  if (!editing) {
    return (
      <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
        <div>
          <span className="font-medium text-ink">{field.label}</span>{" "}
          <span className="text-xs text-muted">
            ({field.key} · {field.type}
            {field.options && field.options.length > 0 ? ` · ${field.options.join(", ")}` : ""})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete field "${field.label}"? Any saved values for it will remain in the database but stop showing.`)) {
                deleteTrackerField(field.id!);
              }
            }}
            className="text-xs text-danger hover:underline"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-2 border-b border-border p-2 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Label
        <input name="label" defaultValue={field.label} required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <select name="field_type" defaultValue={field.type} onChange={(e) => setFieldType(e.target.value as typeof field.type)} className={inputClass}>
          {TRACKER_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Sort order
        <input name="sort_order" type="number" defaultValue={field.sortOrder ?? 0} className={inputClass} />
      </label>
      <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
        Options {TYPE_HELP[fieldType]}
        <input name="options" defaultValue={field.options?.join(", ") ?? ""} className={inputClass} />
      </label>
      {fieldType === "credential" && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Credential type
          <input name="credential_type" defaultValue={field.credentialType ?? ""} className={inputClass} />
        </label>
      )}
      {fieldType === "multi_university_status" && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Date shown when status is
          <input name="date_when_status" defaultValue={field.dateWhenStatus ?? ""} className={inputClass} />
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Only show when field key…
        <input name="show_if_key" defaultValue={field.showWhen?.key ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        …equals (or * for "any value")
        <input name="show_if_equals" defaultValue={field.showWhen?.equals ?? ""} className={inputClass} />
      </label>
      <div className="col-span-full flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
