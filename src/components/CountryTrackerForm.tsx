"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { saveTrackerFields } from "@/lib/actions/countryTracker";
import { CredentialField } from "@/components/CredentialField";
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
}: {
  applicationId: string;
  fields: TrackerFieldDef[];
  values: Record<string, string>;
  revalidateTo: string;
  // Resolved options for fields with `dynamicOptions` set or an empty
  // `options` array (e.g. Italy's `preenrollment_university`, `pending_documents`).
  // Select fields take {value,label} pairs; multi_select/multi_test take plain strings.
  dynamicOptions?: Record<string, { value: string; label: string }[] | string[]>;
  // preenrollment_university option value -> scholarship region, used to
  // auto-fill `scholarship_region` when that select changes.
  regionByUniversityValue?: Record<string, string>;
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
    () => plainFields.filter((f) => !f.showWhen || live[f.showWhen.key] === f.showWhen.equals),
    [plainFields, live]
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visibleFields.map((f) => {
          const staticOptions = f.options && f.options.length > 0 ? f.options.map((o) => ({ value: o, label: o.replace(/_/g, " ") })) : null;
          const dynamic = dynamicOptions[f.key] ?? [];
          const selectOptions: { value: string; label: string }[] =
            staticOptions ?? (dynamic as { value: string; label: string }[]);
          const multiOptions: string[] = staticOptions ? f.options! : (dynamic as string[]);

          return (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs text-muted">{f.label}</label>
              {f.type === "boolean" ? (
                <input type="checkbox" name={f.key} defaultChecked={values[f.key] === "true"} className="h-4 w-4 self-start" />
              ) : f.type === "select" ? (
                <select
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
                  className="rounded-md border border-border px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {selectOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "multi_select" ? (
                <MultiSelectField fieldKey={f.key} options={multiOptions} initial={values[f.key]} />
              ) : f.type === "multi_test" ? (
                <MultiTestField fieldKey={f.key} tests={f.options ?? []} initial={values[f.key]} />
              ) : (
                <input
                  type={f.type === "date" ? "date" : "text"}
                  name={f.key}
                  value={live[f.key] ?? ""}
                  onChange={(e) => setLive((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="rounded-md border border-border px-2 py-1.5 text-sm"
                />
              )}
            </div>
          );
        })}
        <div className="col-span-full">
          {state?.error && <p className="mb-2 text-xs text-danger">{state.error}</p>}
          <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
            Save tracker fields
          </button>
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

type TestEntry = { test: string; date: string; score: string };

// Checkbox per fixed test; each checked test reveals a date + score pair.
// Stored as a JSON array in the same one-column shape as every other field.
function MultiTestField({ fieldKey, tests, initial }: { fieldKey: string; tests: string[]; initial?: string }) {
  const [entries, setEntries] = useState<TestEntry[]>(() => parseJsonArray(initial) as TestEntry[]);

  function isChecked(test: string) {
    return entries.some((e) => e.test === test);
  }

  function toggle(test: string) {
    setEntries((prev) => (prev.some((e) => e.test === test) ? prev.filter((e) => e.test !== test) : [...prev, { test, date: "", score: "" }]));
  }

  function update(test: string, field: "date" | "score", value: string) {
    setEntries((prev) => prev.map((e) => (e.test === test ? { ...e, [field]: value } : e)));
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      {tests.map((test) => (
        <div key={test} className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={isChecked(test)} onChange={() => toggle(test)} />
            {test}
          </label>
          {isChecked(test) && (
            <div className="ml-6 flex gap-2">
              <input
                type="date"
                value={entries.find((e) => e.test === test)?.date ?? ""}
                onChange={(e) => update(test, "date", e.target.value)}
                className="rounded border border-border px-1.5 py-1 text-xs"
              />
              <input
                type="text"
                placeholder="Score"
                value={entries.find((e) => e.test === test)?.score ?? ""}
                onChange={(e) => update(test, "score", e.target.value)}
                className="w-20 rounded border border-border px-1.5 py-1 text-xs"
              />
            </div>
          )}
        </div>
      ))}
      <input type="hidden" name={fieldKey} value={JSON.stringify(entries)} />
    </div>
  );
}
