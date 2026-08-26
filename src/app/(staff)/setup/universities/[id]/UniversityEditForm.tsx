"use client";

import { useActionState } from "react";
import { updateUniversity, deleteUniversity } from "@/lib/actions/universities";

const inputClass = "rounded-md border border-border bg-card px-3 py-2 text-sm";

type University = {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  type: string;
  status: string;
};

export function UniversityEditForm({ university }: { university: University }) {
  const action = updateUniversity.bind(null, university.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <input name="name" defaultValue={university.name} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <select name="type" defaultValue={university.type} required className={inputClass}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          City
          <input name="city" defaultValue={university.city ?? ""} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Region
          <input name="region" defaultValue={university.region ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <select name="status" defaultValue={university.status} className={inputClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="text-xs text-success">Saved.</p>}
      <div className="flex items-center justify-between">
        <button type="submit" disabled={pending} className="self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete ${university.name}? This also deletes all its programs.`)) {
              deleteUniversity(university.id);
            }
          }}
          className="text-xs text-danger hover:underline"
        >
          Delete university
        </button>
      </div>
    </form>
  );
}
