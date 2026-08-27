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

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function AgreementGeneratorPage(props: { searchParams: Promise<{ student?: string }> }) {
  const { student: studentId } = await props.searchParams;
  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, email, country_of_interest, profile:student_profiles(passport_number)")
    .order("full_name");

  const pickerStudents = (students ?? []).map((s) => ({
    id: s.id,
    full_name: s.full_name,
    email: s.email,
    country_of_interest: s.country_of_interest,
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
      .select("id, signatory_name, destination:destinations(display_name)");

    const { data: agreements } = await supabase
      .from("agreements")
      .select("id, status, signing_method, signed_file_path, email_verified, discount_amount, created_at")
      .eq("student_id", selected.id)
      .order("created_at", { ascending: false });

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
          <GenerateAgreementForm studentId={selected.id} templates={templates ?? []} />
        )}
        {agreements && agreements.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
            {agreements.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">
                  v{a.status === "signed" ? "signed" : "pending"} · {a.signing_method ?? "—"} · {new Date(a.created_at).toLocaleDateString()}
                  {a.discount_amount != null && ` · discount ${a.discount_amount}`}
                </span>
                <div className="flex items-center gap-3">
                  <Badge tone={a.status === "signed" ? "success" : "warning"}>{a.status}</Badge>
                  {isSuperAdmin && <DeleteAgreementButton agreementId={a.id} studentId={selected.id} />}
                </div>
              </div>
            ))}
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
