"use client";

import { useActionState, useState } from "react";
import { upsertStudentQualification, deleteStudentQualification } from "@/lib/actions/qualifications";
import { QUALIFICATION_TYPE_LABELS, institutionLabel, type QualificationType } from "@/lib/qualifications";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export type QualificationRowData = {
  id: string;
  qualification_type: QualificationType;
  qualification_name: string | null;
  institution_name: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  grade_percentage: string | null;
} | null;

export function QualificationRow({
  studentId,
  revalidateTo,
  type,
  data,
  deletable = false,
}: {
  studentId: string;
  revalidateTo: string;
  type: QualificationType;
  data: QualificationRowData;
  deletable?: boolean;
}) {
  const [editing, setEditing] = useState(!data);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const action = upsertStudentQualification.bind(null, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function handleDelete() {
    if (!confirm(`Remove this ${QUALIFICATION_TYPE_LABELS[type]} entry?`)) return;
    if (!data) return;
    setDeleteError(null);
    const result = await deleteStudentQualification(data.id, revalidateTo);
    if (result?.error) setDeleteError(result.error);
  }

  if (editing) {
    return (
      <Card className="mb-3">
        <form action={formAction} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input type="hidden" name="qualification_type" value={type} />
          <h4 className="col-span-full text-sm font-medium text-ink">{QUALIFICATION_TYPE_LABELS[type]}</h4>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Qualification name
            <Input name="qualification_name" defaultValue={data?.qualification_name ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            {institutionLabel(type)}
            <Input name="institution_name" defaultValue={data?.institution_name ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            City
            <Input name="city" defaultValue={data?.city ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Country
            <Input name="country" defaultValue={data?.country ?? ""} />
          </label>
          <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
            Complete address
            <Input name="address" defaultValue={data?.address ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Grade / percentage
            <Input name="grade_percentage" defaultValue={data?.grade_percentage ?? ""} />
          </label>
          <div className="col-span-full flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" pending={pending}>
              Save
            </Button>
            {data && (
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
                Cancel
              </button>
            )}
          </div>
          {state?.error && <p className="col-span-full text-xs text-danger">{state.error}</p>}
        </form>
      </Card>
    );
  }

  return (
    <Card className="mb-3">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-medium text-ink">{QUALIFICATION_TYPE_LABELS[type]}</h4>
          <p className="mt-1 text-sm text-ink">{data?.qualification_name ?? "—"}</p>
          <p className="text-xs text-muted">
            {institutionLabel(type)}: {data?.institution_name ?? "—"}
          </p>
          <p className="text-xs text-muted">
            {[data?.city, data?.country].filter(Boolean).join(", ") || "—"}
          </p>
          {data?.address && <p className="text-xs text-muted">{data.address}</p>}
          <p className="text-xs text-muted">Grade/percentage: {data?.grade_percentage ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
            ✏️ Edit
          </button>
          {deletable && (
            <button type="button" onClick={handleDelete} className="text-xs text-danger hover:underline">
              🗑️ Remove
            </button>
          )}
        </div>
      </div>
      {deleteError && <p className="mt-1 text-xs text-danger">{deleteError}</p>}
    </Card>
  );
}
