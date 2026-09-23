"use client";

import { useActionState } from "react";
import { updateUniversity, deleteUniversity } from "@/lib/actions/universities";
import { Button } from "@/components/ui/Button";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";
import { Input, Select } from "@/components/ui/Input";

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
  const del = useButtonAction();

  async function handleDelete() {
    if (!confirm(`Delete ${university.name}? This also deletes all its programs.`)) return;
    // deleteUniversity redirects on success (it throws internally, it never
    // returns) — this only resolves to a value on the error path, and that
    // error is said beside the button. Success leaves the page: a toast.
    await del.run(() => deleteUniversity(university.id), { toast: "Deleted." });
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <Input name="name" defaultValue={university.name} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <Select name="type" defaultValue={university.type} required>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          City
          <Input name="city" defaultValue={university.city ?? ""} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Region
          <Input name="region" defaultValue={university.region ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <Select name="status" defaultValue={university.status}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </label>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <div className="flex items-center justify-between">
        <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Saved." }}>
          Save changes
        </Button>
        <span className="inline-flex items-center gap-2">
          <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
          <button
            type="button"
            onClick={handleDelete}
            disabled={del.pending}
            aria-busy={del.pending || undefined}
            className="w-fit text-xs text-danger hover:underline disabled:opacity-50"
          >
            Delete university
          </button>
        </span>
      </div>
    </form>
  );
}
