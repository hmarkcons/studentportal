import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { CalendarClock, FileSignature, type LucideIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/currentUser";

/**
 * Where a student waits for their portal to open: the brand, what is holding
 * it, and that nothing is lost in the meantime.
 */
function StudentWaiting({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-1 items-center justify-center px-4 py-10"
      style={{
        background:
          "radial-gradient(900px 420px at 10% -10%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 70%), radial-gradient(800px 380px at 100% 110%, color-mix(in srgb, var(--hero-alt-from) 12%, transparent), transparent 70%), var(--bg)",
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--lift-hover)]">
        <span aria-hidden className="bg-hero absolute inset-x-0 top-0 h-1.5" />
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/hmark-logo.png" alt="HMARK Consultants" className="mx-auto h-10 w-auto" />
        <span aria-hidden className="bg-hero mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg shadow-primary/25">
          <Icon className="h-8 w-8" strokeWidth={1.9} />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">{children}</p>
        <SignOutButton className="mt-7 text-sm font-medium text-primary hover:underline">Sign out</SignOutButton>
      </div>
    </div>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, status")
    .eq("id", user.id)
    .maybeSingle();
  if (staffRow && staffRow.status === "active") redirect("/reports");
  if (staffRow && staffRow.status === "suspended") {
    return (
      <div className="flex flex-1 items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold text-ink">Account suspended</h1>
          <p className="mt-2 text-sm text-muted">Your account has been temporarily suspended. Contact HMARK Consultants for details.</p>
          <SignOutButton className="mt-6 text-sm text-primary hover:underline">Sign out</SignOutButton>
        </div>
      </div>
    );
  }

  const { data: studentRow } = await supabase
    .from("leads")
    .select("id, portal_active, student_code")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (studentRow) {
    // Checked before portal_active, and with its own wording. A student whose
    // intake has not been recorded has no Student ID, and the (student) layout
    // turns them back here — telling them to wait for their agreement would be
    // the wrong thing to chase, and this is the screen that stops the two
    // redirects becoming a loop.
    if (!studentRow.student_code) {
      return (
        <StudentWaiting icon={CalendarClock} title="Your intake is being confirmed">
          Your portal opens as soon as HMARK Consultants confirm which intake you are joining and issue your Student ID.
          Your place is already reserved. Contact your counselor if you have your intake confirmed already.
        </StudentWaiting>
      );
    }

    if (studentRow.portal_active) redirect("/portal");

    return (
      <StudentWaiting icon={FileSignature} title="Almost there">
        Your portal access will activate once your signed agreement has been uploaded. Please contact the HMARK
        Consultants team if you&apos;ve already sent it in.
      </StudentWaiting>
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
          <SignOutButton className="mt-6 text-sm text-primary hover:underline">Sign out</SignOutButton>
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
        <SignOutButton className="mt-6 text-sm text-primary hover:underline">Sign out</SignOutButton>
      </div>
    </div>
  );
}
