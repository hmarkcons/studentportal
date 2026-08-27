"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { saveTrackerFields } from "@/lib/actions/countryTracker";
import { CredentialField } from "@/components/CredentialField";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import type { TrackerFieldDef } from "@/lib/countryTrackers";

function parseJsonArray(raw: string | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CountryTrackerForm({
  applicationId,
  fields,
  values,
  revalidateTo,
  dynamicOptions = {},
  regionByUniversityValue = {},
  universityOptions = [],
}: {
  applicationId: string;
  fields: TrackerFieldDef[];
  values: Record<string, string>;
  revalidateTo: string;
  // Resolved options for select fields whose `options` array is empty (e.g.
  // "pick one of this student's applied universities" fields) and for the
  // `pending_documents`-style dynamic lists.
  dynamicOptions?: Record<string, { value: string; label: string }[] | string[]>;
  // preenrollment_university option value -> scholarship region, used to
  // auto-fill `scholarship_region` when that select changes.
  regionByUniversityValue?: Record<string, string>;
  // This application's country's applied universities, used as the per-row
  // picker for multi_university_status fields.
  universityOptions?: { value: string; label: string }[];
}) {
  const plainFields = fields.filter((f) => f.type !== "credential");
  const credentialFields = fields.filter((f) => f.type === "credential");

  const [live, setLive] = useState<Record<string, string>>(values);

  const action = saveTrackerFields.bind(
    null,
    applicationId,
    revalidateTo,
    plainFields.map((f) => ({ key: f.key, type: f.type }))
  );
  const [state, formAction, pending] = useActionState(action, undefined);

  const visibleFields = useMemo(
    () =>
      plainFields.filter((f) => {
        if (!f.showWhen) return true;
        const current = live[f.showWhen.key] ?? "";
        return f.showWhen.equals === "*" ? current.trim().length > 0 : current === f.showWhen.equals;
      }),
    [plainFields, live]
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visibleFields.map((f) => {
          const staticOptions = f.options && f.options.length > 0 ? f.options.map((o) => ({ value: o, label: o.replace(/_/g, " ") })) : null;
          const dynamic = dynamicOptions[f.key] ?? universityOptions;
          const selectOptions: { value: string; label: string }[] =
            staticOptions ?? (dynamic as { value: string; label: string }[]);
          const multiOptions: string[] = staticOptions ? f.options! : (dynamic as string[]);

          return (
            <div key={f.key} className={f.type === "multi_university_status" ? "col-span-full flex flex-col gap-1" : "flex flex-col gap-1"}>
              <label className="text-xs text-muted">{f.label}</label>
              {f.type === "boolean" ? (
                <input type="checkbox" name={f.key} defaultChecked={values[f.key] === "true"} className="h-4 w-4 self-start" />
              ) : f.type === "select" ? (
                <Select
                  name={f.key}
                  value={live[f.key] ?? ""}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLive((prev) => ({
                      ...prev,
                      [f.key]: next,
                      ...(f.key === "preenrollment_university" && regionByUniversityValue[next]
                        ? { scholarship_region: regionByUniversityValue[next] }
                        : {}),
                    }));
                  }}
                >
                  <option value="">—</option>
                  {selectOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.type === "multi_select" ? (
                <MultiSelectField fieldKey={f.key} options={multiOptions} initial={values[f.key]} />
              ) : f.type === "multi_text" ? (
                <MultiTextField fieldKey={f.key} initial={values[f.key]} />
              ) : f.type === "multi_university_status" ? (
                <UniversityStatusField
                  fieldKey={f.key}
                  statusOptions={f.options ?? []}
                  dateWhenStatus={f.dateWhenStatus}
                  universities={universityOptions}
                  initial={values[f.key]}
                />
              ) : f.type === "textarea" ? (
                <Textarea
                  name={f.key}
                  value={live[f.key] ?? ""}
                  onChange={(e) => setLive((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  rows={3}
                />
              ) : (
                <Input
                  type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                  name={f.key}
                  value={live[f.key] ?? ""}
                  onChange={(e) => setLive((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              )}
            </div>
          );
        })}
        <div className="col-span-full">
          {state?.error && <p className="mb-2 text-xs text-danger">{state.error}</p>}
          <Button type="submit" variant="primary" pending={pending}>
            Save tracker fields
          </Button>
        </div>
      </form>

      {credentialFields.length > 0 && (
        <div className="flex flex-col gap-3">
          {credentialFields.map((f) => (
            <CredentialField
              key={f.key}
              label={f.label}
              ownerType="application"
              ownerId={applicationId}
              credentialType={f.credentialType ?? f.key}
              revalidateTo={revalidateTo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Checkbox list JSON-encoded into a single hidden input — no schema change
// needed since application_country_extra.field_value is generic text.
function MultiSelectField({ fieldKey, options, initial }: { fieldKey: string; options: string[]; initial?: string }) {
  const [selected, setSelected] = useState<string[]>(() => parseJsonArray(initial) as string[]);

  function toggle(o: string) {
    setSelected((prev) => (prev.includes(o) ? prev.filter((v) => v !== o) : [...prev, o]));
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-2">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
          {o}
        </label>
      ))}
      {options.length === 0 && <p className="text-xs text-muted">Nothing to select yet.</p>}
      <input type="hidden" name={fieldKey} value={JSON.stringify(selected)} />
    </div>
  );
}

// Free-typed repeatable list ("Pending document 1", "Pending document 2", …)
// — staff types arbitrary names rather than picking from a fixed list.
function MultiTextField({ fieldKey, initial }: { fieldKey: string; initial?: string }) {
  const [items, setItems] = useState<string[]>(() => {
    const parsed = parseJsonArray(initial) as string[];
    return parsed.length > 0 ? parsed : [];
  });

  function update(i: number, value: string) {
    setItems((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  }

  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      {items.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={v}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`Pending document ${i + 1}`}
            className="flex-1"
          />
          <button type="button" onClick={() => remove(i)} className="text-xs text-danger hover:underline">
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, ""])}
        className="self-start text-xs font-medium text-primary hover:underline"
      >
        + Add document
      </button>
      {items.length === 0 && <p className="text-xs text-muted">No pending documents listed.</p>}
      <input type="hidden" name={fieldKey} value={JSON.stringify(items.filter((v) => v.trim()))} />
    </div>
  );
}

type UniStatusEntry = { university_id: string; status: string; date?: string };

// Repeatable {university, status, optional date} rows — e.g. a credibility
// interview per applied university, or a per-university bank-statement
// requirement. Value stored as a JSON array in the one field_value column.
function UniversityStatusField({
  fieldKey,
  statusOptions,
  dateWhenStatus,
  universities,
  initial,
}: {
  fieldKey: string;
  statusOptions: string[];
  dateWhenStatus?: string;
  universities: { value: string; label: string }[];
  initial?: string;
}) {
  const [entries, setEntries] = useState<UniStatusEntry[]>(() => parseJsonArray(initial) as UniStatusEntry[]);

  function update(i: number, patch: Partial<UniStatusEntry>) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  function remove(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      {entries.map((entry, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select
            value={entry.university_id}
            onChange={(e) => update(i, { university_id: e.target.value })}
          >
            <option value="">University…</option>
            {universities.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
          <Select
            value={entry.status}
            onChange={(e) => update(i, { status: e.target.value })}
          >
            <option value="">Status…</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          {dateWhenStatus && entry.status === dateWhenStatus && (
            <Input
              type="date"
              value={entry.date ?? ""}
              onChange={(e) => update(i, { date: e.target.value })}
            />
          )}
          <button type="button" onClick={() => remove(i)} className="text-xs text-danger hover:underline">
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setEntries((prev) => [...prev, { university_id: "", status: "" }])}
        className="self-start text-xs font-medium text-primary hover:underline"
      >
        + Add
      </button>
      {universities.length === 0 && <p className="text-xs text-muted">No applications for this country yet.</p>}
      <input type="hidden" name={fieldKey} value={JSON.stringify(entries.filter((e) => e.university_id && e.status))} />
    </div>
  );
}
