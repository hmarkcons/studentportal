"use client";

import { useActionState } from "react";
import { updateUniversity, deleteUniversity } from "@/lib/actions/universities";
import { Button } from "@/components/ui/Button";
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
      {state?.success && <p className="text-xs text-success">Saved.</p>}
      <div className="flex items-center justify-between">
        <Button type="submit" variant="primary" pending={pending} className="self-start">
          Save changes
        </Button>
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
