"use client";

import { useState } from "react";
import { QUALIFICATION_TYPE_LABELS, type QualificationType } from "@/lib/qualifications";
import { QualificationRow } from "@/components/QualificationRow";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";

export function AddQualificationButton({
  studentId,
  revalidateTo,
  availableTypes,
  existingCount,
}: {
  studentId: string;
  revalidateTo: string;
  availableTypes: QualificationType[];
  // How many qualifications are already saved. A successful save revalidates
  // the page, so this number growing is the signal that the open draft
  // persisted — see the reset below.
  existingCount: number;
}) {
  const [adding, setAdding] = useState<QualificationType | null>(null);
  const [selected, setSelected] = useState<QualificationType | "">("");
  const [seenCount, setSeenCount] = useState(existingCount);

  // Drop back to the picker once the draft has been saved, so another
  // qualification can be added straight away instead of the form sitting
  // open over a row that is already persisted. Adjusting state during
  // render (React's documented pattern) rather than in an effect, so the
  // picker is there in the same render the new row arrives in.
  if (existingCount !== seenCount) {
    setSeenCount(existingCount);
    setAdding(null);
    setSelected("");
  }

  if (adding) {
    return (
      <QualificationRow
        studentId={studentId}
        revalidateTo={revalidateTo}
        type={adding}
        data={null}
        deletable
        onCancel={() => {
          setAdding(null);
          setSelected("");
        }}
      />
    );
  }

  if (availableTypes.length === 0) {
    return <p className="text-xs text-muted">Every qualification type has already been added.</p>;
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
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
