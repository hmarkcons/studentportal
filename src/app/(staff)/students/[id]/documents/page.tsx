import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { DocumentChecklist, type DocRow } from "@/components/DocumentChecklist";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentDocumentsTab(props: PageProps<"/students/[id]/documents">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: applications } = await supabase
    .from("applications")
    .select("id, university:universities(name)")
    .eq("student_id", id);

  const { data: rawDocs } = await supabase
    .from("student_documents")
    .select("id, category, custom_name, status, file_path, deadline, rejected_reason, application_id, template:document_templates(name)")
    .eq("student_id", id)
    .order("created_at", { ascending: false })
    .returns<(DocRow & { application_id: string | null; custom_name: string | null; template: { name: string } | { name: string }[] | null })[]>();

  const appLabel = new Map((applications ?? []).map((a) => [a.id, one(a.university as never) as { name?: string } | null]));

  const docsWithUrls = await Promise.all(
    (rawDocs ?? []).map(async (d) => {
      const templateName = one(d.template as never) as { name?: string } | null;
      const uni = d.application_id ? appLabel.get(d.application_id) : null;
      const name = `${d.custom_name ?? templateName?.name ?? d.category ?? "Document"}${uni?.name ? ` — ${uni.name}` : " — Student-level"}`;
      if (!d.file_path) return { ...d, name };
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      return { ...d, name, fileUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <Card>
      <h3 className="mb-3 text-sm font-medium text-ink">All documents</h3>
      <DocumentChecklist docs={docsWithUrls} studentId={id} applicationId={null} revalidateTo={`/students/${id}/documents`} />
    </Card>
  );
}
