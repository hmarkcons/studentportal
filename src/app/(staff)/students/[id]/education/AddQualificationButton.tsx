"use client";

import { useState } from "react";
import { ADDITIONAL_QUALIFICATION_TYPES, QUALIFICATION_TYPE_LABELS, type QualificationType } from "@/lib/qualifications";
import { QualificationRow } from "./QualificationRow";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";

export function AddQualificationButton({
  studentId,
  revalidateTo,
  availableTypes,
}: {
  studentId: string;
  revalidateTo: string;
  availableTypes: QualificationType[];
}) {
  const [adding, setAdding] = useState<QualificationType | null>(null);
  const [selected, setSelected] = useState<QualificationType | "">("");

  if (adding) {
    return <QualificationRow studentId={studentId} revalidateTo={revalidateTo} type={adding} data={null} deletable />;
  }

  if (availableTypes.length === 0) {
    return <p className="text-xs text-muted">Every qualification type has already been added.</p>;
  }

  return (
    <div className="flex items-end gap-2">
      <Select value={selected} onChange={(e) => setSelected(e.target.value as QualificationType)} className="w-auto">
        <option value="">Choose a qualification…</option>
        {availableTypes.map((t) => (
          <option key={t} value={t}>
            {QUALIFICATION_TYPE_LABELS[t]}
          </option>
        ))}
      </Select>
      <Button type="button" variant="outline-primary" size="sm" disabled={!selected} onClick={() => setAdding(selected as QualificationType)}>
        + Add qualification
      </Button>
    </div>
  );
}
