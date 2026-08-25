import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "./RegisterForm";

export default async function PartnerRegisterPage() {
  const supabase = await createClient();
  const { data: universities } = await supabase.from("universities").select("id, name").order("name");

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8">
        <h1 className="text-lg font-semibold text-ink">Partner University Registration</h1>
        <p className="mt-1 text-sm text-muted">Your account will be reviewed and approved by HMARK Consultants.</p>
        <RegisterForm universities={universities ?? []} />
      </div>
    </div>
  );
}
