import { hasRole } from "@/lib/auth/roles";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { NewAgreementTemplateForm } from "./NewAgreementTemplateForm";
import { TemplateActionsMenu } from "./TemplateActionsMenu";
import { StaffTemplateForm } from "./StaffTemplateForm";
import { StaffTemplateActions } from "./StaffTemplateActions";
import { SectionTabs } from "@/components/SectionTabs";
import { getEffectivePermissions } from "@/lib/auth/permissions";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * Staff agreement templates: a tab of their own, shown only to someone holding
 * staff_agreements.templates — a Super Admin until the Role Permissions
 * screen grants it to a role. The table's own policy refuses everyone else,
 * so leaving the tab out is courtesy; the database is the lock.
 */
async function StaffTemplates() {
  const { supabase } = await getStaffSession();
  const { data: templates } = await supabase
    .from("staff_agreement_templates")
    .select("id, name, signatory_name, updated_at")
    .order("name");

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        The wording of staff employment agreements. Generate one for a staff member from the Agreement Generator&apos;s Staff
        tab, or from their row in Staff Management.
      </p>
      <Card className="mb-6">
        <StaffTemplateForm />
      </Card>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(templates ?? []).map((t) => (
          <div key={t.id} data-staff-template={t.name} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink">
              {t.name} <span className="text-muted">· {t.signatory_name}</span>
            </span>
            <StaffTemplateActions id={t.id} name={t.name} />
          </div>
        ))}
        {(!templates || templates.length === 0) && <p className="px-4 py-6 text-sm text-muted">No staff agreement templates yet.</p>}
      </div>
    </>
  );
}

export default async function AgreementTemplatesPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await props.searchParams;
  const { supabase, staff } = await getStaffSession();
  const isSuperAdmin = hasRole(staff, "super_admin");
  const canStaffTemplates = (await getEffectivePermissions())["staff_agreements.templates"] === true;
  const active = tab === "staff" && canStaffTemplates ? "staff" : "students";
  const tabs = [
    { key: "students", label: "Students", href: "/setup/agreement-templates" },
    ...(canStaffTemplates ? [{ key: "staff", label: "Staff", href: "/setup/agreement-templates?tab=staff" }] : []),
  ];

  if (active === "staff") {
    return (
      <div className="w-full">
        <h2 className="mb-4 text-lg font-semibold text-ink">Agreement Templates</h2>
        <SectionTabs tabs={tabs} active={active} />
        <StaffTemplates />
      </div>
    );
  }

  const { data: destinations } = await supabase.from("destinations").select("id, display_name").order("display_name");
  const { data: templates } = await supabase
    .from("agreement_templates")
    .select("id, name, signatory_name, wording, destination:destinations(display_name)")
    .order("created_at", { ascending: false });

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Agreement Templates</h2>
      <SectionTabs tabs={tabs} active={active} />
      <p className="mb-4 text-sm text-muted">
        Staff pick from these when generating a student&apos;s agreement. Multiple templates per destination are supported —
        {isSuperAdmin ? " open one to edit its wording." : " only Super Admin can edit or delete them."}
      </p>
      {isSuperAdmin && (
        <Card className="mb-6">
          <NewAgreementTemplateForm destinations={destinations ?? []} />
        </Card>
      )}

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(templates ?? []).map((t) => {
          const destination = one(t.destination as never) as { display_name?: string } | null;
          return (
            <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-ink">
                {t.name} <span className="text-muted">· {destination?.display_name ?? "—"} · {t.signatory_name}</span>
              </span>
              <TemplateActionsMenu
                template={{ id: t.id, name: t.name, signatory_name: t.signatory_name, wording: t.wording, destinationName: destination?.display_name ?? null }}
                canManage={isSuperAdmin}
              />
            </div>
          );
        })}
        {(!templates || templates.length === 0) && <p className="px-4 py-6 text-sm text-muted">No agreement templates yet.</p>}
      </div>
    </div>
  );
}
