import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { PARTNER_NAV } from "@/lib/nav";

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: partnerRow } = await supabase
    .from("partner_university_accounts")
    .select("staff_name, status, university:universities(name)")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!partnerRow || partnerRow.status !== "active") {
    redirect("/");
  }

  const university = Array.isArray(partnerRow.university)
    ? partnerRow.university[0]
    : partnerRow.university;

  return (
    <AppShell
      brand="Partner Portal"
      nav={PARTNER_NAV}
      userName={partnerRow.staff_name}
      userSubtitle={university?.name ?? "Partner University"}
    >
      {children}
    </AppShell>
  );
}
