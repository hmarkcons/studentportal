"use client";

import { useActionState, useState } from "react";
import { updateScholarshipBody, deleteScholarshipBody } from "@/lib/actions/scholarships";

type Body = {
  id: string;
  name: string;
  region: string | null;
  academic_year: string;
  covers: string[];
  stipend_amount: string | null;
};

export function ScholarshipBodyRow({ body, isSuperAdmin }: { body: Body; isSuperAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const action = updateScholarshipBody.bind(null, body.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (editing) {
    return (
      <tr className="border-b border-border last:border-0">
        <td colSpan={6} className="px-4 py-3">
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <input name="name" defaultValue={body.name} required className="rounded-md border border-border px-2 py-1.5 text-sm" />
            <input name="region" defaultValue={body.region ?? ""} placeholder="Region" className="rounded-md border border-border px-2 py-1.5 text-sm" />
            <input name="academic_year" defaultValue={body.academic_year} required className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" />
            <input name="covers" defaultValue={body.covers.join(", ")} placeholder="Covers (comma-separated)" className="min-w-[200px] flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
            <input name="stipend_amount" defaultValue={body.stipend_amount ?? ""} placeholder="Stipend / notes" className="rounded-md border border-border px-2 py-1.5 text-sm" />
            <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
              Cancel
            </button>
            {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">{body.name}</td>
      <td className="px-4 py-3">{body.region ?? "—"}</td>
      <td className="px-4 py-3">{body.covers.join(", ") || "—"}</td>
      <td className="px-4 py-3">{body.academic_year}</td>
      <td className="px-4 py-3">{body.stipend_amount ?? "—"}</td>
      <td className="px-4 py-3">
        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(true)} title="Edit" className="rounded p-1 text-muted hover:text-primary">
              ✏️
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete ${body.name}?`)) deleteScholarshipBody(body.id);
              }}
              title="Delete"
              className="rounded p-1 text-muted hover:text-danger"
            >
              🗑️
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
