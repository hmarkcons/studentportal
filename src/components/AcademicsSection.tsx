import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  STANDARD_QUALIFICATION_TYPES,
  ADDITIONAL_QUALIFICATION_TYPES,
  qualificationChecklist,
  type QualificationType,
} from "@/lib/qualifications";
import { QualificationRow, type QualificationRowData } from "@/components/QualificationRow";
import { AddQualificationButton } from "@/components/AddQualificationButton";

export function AcademicsSection({
  studentId,
  revalidateTo,
  levelApplyingFor,
  qualifications,
}: {
  studentId: string;
  revalidateTo: string;
  levelApplyingFor: string | null;
  qualifications: { qualification_type: string; [key: string]: unknown }[];
}) {
  const byType = new Map<QualificationType, QualificationRowData>(
    qualifications.map((q) => [q.qualification_type as QualificationType, q as QualificationRowData])
  );
  const presentTypes = new Set<QualificationType>(qualifications.map((q) => q.qualification_type as QualificationType));
  const checklist = qualificationChecklist(levelApplyingFor, presentTypes);

  // Listed per row, not per type — a student can hold two Bachelors from
  // different institutions, so the same type may legitimately appear twice.
  const additionalTypes = new Set<string>(ADDITIONAL_QUALIFICATION_TYPES);
  const existingAdditional = qualifications
    .filter((q) => additionalTypes.has(q.qualification_type))
    .map((q) => q as QualificationRowData);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h3 className="mb-2 text-sm font-medium text-ink">Completeness</h3>
        <div className="flex flex-col gap-1">
          {checklist.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-sm">
              <Badge tone={item.met ? "success" : "warning"}>{item.met ? "✓" : "Missing"}</Badge>
              <span className={item.met ? "text-ink" : "text-muted"}>{item.label}</span>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <h3 className="mb-3 text-sm font-medium text-ink">Standard qualifications</h3>
        {STANDARD_QUALIFICATION_TYPES.map((type) => (
          <QualificationRow key={type} studentId={studentId} revalidateTo={revalidateTo} type={type} data={byType.get(type) ?? null} />
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-ink">Additional qualifications</h3>
        {existingAdditional.map((q) => (
          <QualificationRow
            key={q!.id}
            studentId={studentId}
            revalidateTo={revalidateTo}
            type={q!.qualification_type}
            data={q}
            deletable
          />
        ))}
        <AddQualificationButton studentId={studentId} revalidateTo={revalidateTo} availableTypes={[...ADDITIONAL_QUALIFICATION_TYPES]} />
      </div>
    </div>
  );
}
