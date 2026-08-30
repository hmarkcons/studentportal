import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  STANDARD_QUALIFICATION_TYPES,
  ADDITIONAL_QUALIFICATION_TYPES,
  qualificationChecklist,
  type QualificationType,
} from "@/lib/qualifications";
import { QualificationRow, type QualificationRowData } from "./QualificationRow";
import { AddQualificationButton } from "./AddQualificationButton";

export default async function StudentEducationTab(props: PageProps<"/students/[id]/education">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const [{ data: student }, { data: qualifications }] = await Promise.all([
    supabase.from("students").select("level_applying_for").eq("id", id).maybeSingle(),
    supabase.from("student_qualifications").select("*").eq("student_id", id),
  ]);

  const byType = new Map<QualificationType, QualificationRowData>(
    (qualifications ?? []).map((q) => [q.qualification_type as QualificationType, q as QualificationRowData])
  );
  const presentTypes = new Set<QualificationType>(byType.keys());
  const checklist = qualificationChecklist(student?.level_applying_for ?? null, presentTypes);
  const revalidateTo = `/students/${id}/education`;

  const availableAdditionalTypes = ADDITIONAL_QUALIFICATION_TYPES.filter((t) => !presentTypes.has(t));
  const existingAdditional = ADDITIONAL_QUALIFICATION_TYPES.filter((t) => presentTypes.has(t));

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
          <QualificationRow key={type} studentId={id} revalidateTo={revalidateTo} type={type} data={byType.get(type) ?? null} />
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-ink">Additional qualifications</h3>
        {existingAdditional.map((type) => (
          <QualificationRow key={type} studentId={id} revalidateTo={revalidateTo} type={type} data={byType.get(type) ?? null} deletable />
        ))}
        <AddQualificationButton studentId={id} revalidateTo={revalidateTo} availableTypes={[...availableAdditionalTypes]} />
      </div>
    </div>
  );
}
