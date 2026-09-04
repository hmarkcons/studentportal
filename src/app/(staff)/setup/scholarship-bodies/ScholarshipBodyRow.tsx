"use client";

import { useActionState, useState } from "react";
import { updateScholarshipBody, deleteScholarshipBody } from "@/lib/actions/scholarships";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Body = {
  id: string;
  name: string;
  region: string | null;
  academic_year: string;
  covers: string[];
  stipend_amount: string | null;
  source_url: string | null;
};

export function ScholarshipBodyRow({ body, isSuperAdmin }: { body: Body; isSuperAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const action = updateScholarshipBody.bind(null, body.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function handleDelete() {
    if (!confirm(`Delete ${body.name}?`)) return;
    setDeleteError(null);
    const result = await deleteScholarshipBody(body.id);
    if (result?.error) setDeleteError(result.error);
  }

  if (editing) {
    return (
      <tr className="border-b border-border last:border-0">
        <td colSpan={6} className="px-4 py-3">
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <Input name="name" defaultValue={body.name} required />
            <Input name="region" defaultValue={body.region ?? ""} placeholder="Region" />
            <Input name="academic_year" defaultValue={body.academic_year} required className="w-28" />
            <Input name="covers" defaultValue={body.covers.join(", ")} placeholder="Covers (comma-separated)" className="min-w-[200px] flex-1" />
            <Input name="stipend_amount" defaultValue={body.stipend_amount ?? ""} placeholder="Stipend / notes" />
            <Button type="submit" variant="primary" size="sm" pending={pending}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        {body.name}
        {body.source_url && (
          <a
            href={body.source_url}
            target="_blank"
            rel="noreferrer"
            className="ml-2 text-xs text-primary hover:underline"
          >
            🔗 View source
          </a>
        )}
      </td>
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
            <button onClick={handleDelete} title="Delete" className="rounded p-1 text-muted hover:text-danger">
              🗑️
            </button>
          </div>
        )}
        {deleteError && <p className="mt-1 text-xs text-danger">{deleteError}</p>}
      </td>
    </tr>
  );
}
