"use client";

import { useState } from "react";
import { useFormAction } from "@/components/useFormAction";
import { useButtonAction } from "@/components/useButtonAction";
import { ActionStatus } from "@/components/ActionStatus";
import { toast } from "@/lib/toast";
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
  onCancel,
}: {
  studentId: string;
  revalidateTo: string;
  type: QualificationType;
  data: QualificationRowData;
  deletable?: boolean;
  // Supplied for an unsaved draft row, so it can be dismissed without
  // saving. An existing row cancels back to its read-only view instead.
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(!data);
  const remove = useButtonAction();
  const action = upsertStudentQualification.bind(null, studentId, revalidateTo);
  // See useFormAction: React's own form reset empties an uncontrolled field
  // when the action refuses, taking the institution and grade with it.
  // A draft opened from "+ Add qualification" (the one with onCancel) closes
  // back to the picker once it saves, taking its Save button with it, so that
  // one confirms with a toast as well as beside the button.
  const { onSubmit, pending, error, result } = useFormAction(action, {
    onSuccess: !data && onCancel ? () => toast("Added.") : undefined,
  });

  async function handleDelete() {
    if (!confirm(`Remove this ${QUALIFICATION_TYPE_LABELS[type]} entry?`)) return;
    if (!data) return;
    // The row goes once this lands, so success is a toast; a refusal is said
    // beside the Remove button that is still there.
    await remove.run(() => deleteStudentQualification(data.id, revalidateTo), { toast: "Removed." });
  }

  if (editing) {
    return (
      <Card className="mb-3">
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input type="hidden" name="qualification_type" value={type} />
          {/* Present only when editing an existing row — its absence is what
              tells the action to add another entry of this type. */}
          {data && <input type="hidden" name="qualification_id" value={data.id} />}
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
            <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state: result, label: "Saved." }}>
              Save
            </Button>
            {(data || onCancel) && (
              <button
                type="button"
                onClick={() => (data ? setEditing(false) : onCancel?.())}
                className="text-xs text-muted hover:underline"
              >
                Cancel
              </button>
            )}
          </div>
          {error && (
            <p
              role="alert"
              className="col-span-full rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm font-medium text-danger"
            >
              {error}
              <span className="mt-0.5 block text-xs font-normal">Nothing was saved — what you typed is still here.</span>
            </p>
          )}
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
            <span className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={remove.pending}
                aria-busy={remove.pending || undefined}
                className="w-fit text-xs text-danger hover:underline disabled:opacity-50"
              >
                🗑️ Remove
              </button>
              <ActionStatus state={remove.state} pending={remove.pending} label="Removed." showError />
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
