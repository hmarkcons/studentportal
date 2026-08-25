import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, status")
    .eq("id", user.id)
    .maybeSingle();
  if (staffRow && staffRow.status === "active") redirect("/reports");

  const { data: studentRow } = await supabase
    .from("leads")
    .select("id, portal_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (studentRow) {
    if (studentRow.portal_active) redirect("/portal");

    return (
      <div className="flex flex-1 items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold text-ink">Almost there</h1>
          <p className="mt-2 text-sm text-muted">
            Your portal access will activate once your signed agreement has been uploaded. Please
            contact the HMARK Consultants team if you&apos;ve already sent it in.
          </p>
          <form action={signOut} className="mt-6">
            <button type="submit" className="text-sm text-primary hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { data: partnerRow } = await supabase
    .from("partner_university_accounts")
    .select("id, status")
    .eq("id", user.id)
    .maybeSingle();
  if (partnerRow && partnerRow.status === "active") redirect("/partner");
  if (partnerRow && partnerRow.status === "pending") {
    return (
      <div className="flex flex-1 items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold text-ink">Pending approval</h1>
          <p className="mt-2 text-sm text-muted">
            Your partner university account is awaiting approval from HMARK Consultants.
          </p>
          <form action={signOut} className="mt-6">
            <button type="submit" className="text-sm text-primary hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">No account found</h1>
        <p className="mt-2 text-sm text-muted">
          This login isn&apos;t linked to a staff, student, or partner account. Contact HMARK
          Consultants for help.
        </p>
        <form action={signOut} className="mt-6">
          <button type="submit" className="text-sm text-primary hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
