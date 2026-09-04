import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StudentPicker } from "./StudentPicker";
import {
  GenerateAgreementForm,
  UploadSignedAgreementForm,
  DeleteAgreementButton,
} from "@/app/(staff)/students/[id]/GenerateAgreementForm";
import { GenerateAgreementPdfButton } from "@/app/(staff)/students/[id]/GenerateAgreementPdfButton";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function AgreementGeneratorPage(props: { searchParams: Promise<{ student?: string }> }) {
  const { student: studentId } = await props.searchParams;
  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, email, country_of_interest, discount_amount, profile:student_profiles(passport_number)")
    .order("full_name");

  const pickerStudents = (students ?? []).map((s) => ({
    id: s.id,
    full_name: s.full_name,
    email: s.email,
    country_of_interest: s.country_of_interest,
    discount_amount: s.discount_amount,
    passport_number: (one(s.profile as never) as { passport_number?: string } | null)?.passport_number ?? null,
  }));

  const countries = Array.from(
    new Set(
      pickerStudents
        .flatMap((s) => (s.country_of_interest ?? "").split(",").map((c: string) => c.trim()))
        .filter(Boolean)
    )
  ).sort();

  const selected = pickerStudents.find((s) => s.id === studentId);

  let panel: React.ReactNode = null;
  if (selected) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
    const role = staffRow?.role;
    const isSuperAdmin = role === "super_admin";
    const canModifyAgreement = role === "super_admin" || role === "processing";

    const { data: templates } = await supabase
      .from("agreement_templates")
      .select("id, name, signatory_name, destination:destinations(display_name)");

    const { data: agreements } = await supabase
      .from("agreements")
      .select(
        "id, status, signing_method, signed_file_path, pdf_path, email_verified, discount_amount, created_at, template:agreement_templates(file_path)"
      )
      .eq("student_id", selected.id)
      .order("created_at", { ascending: false });

    const agreementLinks = new Map<string, { templateUrl?: string; signedUrl?: string; pdfUrl?: string }>();
    await Promise.all(
      (agreements ?? []).map(async (a) => {
        const links: { templateUrl?: string; signedUrl?: string; pdfUrl?: string } = {};
        const tmpl = one(a.template as never) as { file_path?: string } | null;
        if (tmpl?.file_path) {
          const { data } = await supabase.storage.from("documents").createSignedUrl(tmpl.file_path, 3600);
          if (data?.signedUrl) links.templateUrl = data.signedUrl;
        }
        if (a.signed_file_path) {
          const { data } = await supabase.storage.from("documents").createSignedUrl(a.signed_file_path, 3600);
          if (data?.signedUrl) links.signedUrl = data.signedUrl;
        }
        if (a.pdf_path) {
          const { data } = await supabase.storage.from("documents").createSignedUrl(a.pdf_path, 3600);
          if (data?.signedUrl) links.pdfUrl = data.signedUrl;
        }
        agreementLinks.set(a.id, links);
      })
    );

    const latestAgreement = agreements?.[0];

    panel = (
      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">Agreement — {selected.full_name}</h3>
          <Link href={`/students/${selected.id}`} className="text-xs text-primary hover:underline">
            View full student record →
          </Link>
        </div>
        {(role === "super_admin" || role === "processing") && (
          <GenerateAgreementForm studentId={selected.id} templates={templates ?? []} discountAmount={selected.discount_amount ?? null} />
        )}
        {agreements && agreements.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
            {agreements.map((a) => {
              const links = agreementLinks.get(a.id);
              return (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">
                    v{a.status === "signed" ? "signed" : "pending"} · {a.signing_method ?? "—"} · {new Date(a.created_at).toLocaleDateString()}
                    {a.discount_amount != null && ` · discount ${a.discount_amount}`}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {links?.signedUrl ? (
                      <a
                        href={links.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        View signed copy
                      </a>
                    ) : (
                      !links?.pdfUrl &&
                      links?.templateUrl && (
                        <a
                          href={links.templateUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                          View template
                        </a>
                      )
                    )}
                    {links?.pdfUrl && (
                      <a
                        href={links.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        View generated agreement
                      </a>
                    )}
                    {canModifyAgreement && a.status !== "signed" && (
                      <GenerateAgreementPdfButton
                        agreementId={a.id}
                        studentId={selected.id}
                        revalidateTo={`/setup/agreement-generator?student=${selected.id}`}
                        hasPdf={Boolean(links?.pdfUrl)}
                      />
                    )}
                    <Badge tone={a.status === "signed" ? "success" : "warning"}>{a.status}</Badge>
                    {isSuperAdmin && <DeleteAgreementButton agreementId={a.id} studentId={selected.id} />}
                  </div>
                </div>
              );
            })}
            {canModifyAgreement && latestAgreement && latestAgreement.status !== "signed" && (
              <UploadSignedAgreementForm agreementId={latestAgreement.id} studentId={selected.id} />
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Agreement Generator</h2>
      <p className="mb-4 text-sm text-muted">
        Find a registered student to generate, view, or manage their agreement — without navigating to their full record.
      </p>
      <Card>
        <StudentPicker students={pickerStudents} countries={countries} />
      </Card>
      {panel}
    </div>
  );
}
