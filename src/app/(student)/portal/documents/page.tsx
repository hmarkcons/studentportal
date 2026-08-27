import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { PortalDocumentRow } from "../applications/[id]/PortalDocumentRow";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PortalDocumentsPage() {
  const { supabase, userId } = await getStudentUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", userId ?? "").maybeSingle();
  if (!student) return null;

  await ensureStudentDocumentRequirements(student.id);

  const { data: applications } = await supabase.from("applications").select("id, university:universities(name)").eq("student_id", student.id);
  const appLabel = new Map((applications ?? []).map((a) => [a.id, one(a.university as never) as { name?: string } | null]));

  const { data: rawDocs } = await supabase
    .from("student_documents")
    .select("id, category, custom_name, status, file_path, deadline, rejected_reason, application_id, template:document_templates(name)")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  const docsWithUrls = await Promise.all(
    (rawDocs ?? []).map(async (d) => {
      const uni = d.application_id ? appLabel.get(d.application_id) : null;
      const templateName = one(d.template as never) as { name?: string } | null;
      const baseName = d.custom_name ?? templateName?.name ?? d.category ?? "Document";
      const custom_name = `${baseName}${uni?.name ? ` — ${uni.name}` : " — General"}`;
      if (!d.file_path) return { ...d, custom_name };
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      return { ...d, custom_name, fileUrl: data?.signedUrl ?? null };
    })
  );

  const studentLevelDocs = docsWithUrls.filter((d) => !d.application_id);
  const applicationDocs = docsWithUrls.filter((d) => d.application_id);

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-6 text-lg font-semibold text-ink">Documents</h2>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">General documents</h3>
        {studentLevelDocs.length === 0 ? (
          <p className="text-sm text-muted">Nothing required here yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {studentLevelDocs.map((doc) => (
              <PortalDocumentRow key={doc.id} doc={doc} studentId={student.id} revalidateTo="/portal/documents" />
            ))}
          </div>
        )}
      </Card>

      {applicationDocs.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Application documents</h3>
          <div className="flex flex-col divide-y divide-border">
            {applicationDocs.map((doc) => (
              <PortalDocumentRow key={doc.id} doc={doc} studentId={student.id} revalidateTo="/portal/documents" />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
