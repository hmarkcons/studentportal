import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { StaffTemplateForm } from "../../StaffTemplateForm";

export default async function EditStaffAgreementTemplatePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if ((await getEffectivePermissions())["staff_agreements.templates"] !== true) notFound();

  const { supabase } = await getStaffSession();
  const { data: template } = await supabase
    .from("staff_agreement_templates")
    .select("id, name, signatory_name, wording")
    .eq("id", id)
    .maybeSingle();
  if (!template) notFound();

  return (
    <div className="w-full">
      <Link href="/setup/agreement-templates?tab=staff" className="mb-3 inline-block text-sm text-primary hover:underline">
        ← Staff agreement templates
      </Link>
      <h2 className="mb-4 text-lg font-semibold text-ink">{template.name}</h2>
      <Card>
        <StaffTemplateForm template={template} />
      </Card>
      <p className="mt-3 text-xs text-muted">
        Editing the wording changes agreements generated from now on. Ones already generated keep the PDF they were made
        with — regenerate a draft to pick up the change.
      </p>
    </div>
  );
}
