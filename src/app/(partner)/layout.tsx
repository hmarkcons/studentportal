import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { PARTNER_NAV } from "@/lib/nav";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { deliverNotificationEmailsSoon } from "@/lib/notificationDelivery";
import { CalendarNotifier } from "@/components/CalendarNotifier";
import { loadPartnerCalendarNotifications } from "@/lib/actions/portalCalendarNotifications";

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const user = await getCurrentUser();

  const { data: partnerRow } = await supabase
    .from("partner_university_accounts")
    .select("staff_name, status, university:universities(name)")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!partnerRow || partnerRow.status !== "active") {
    redirect("/");
  }

  // Alerts due an email go out once this page has been served (0320).
  deliverNotificationEmailsSoon();

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
      <CalendarNotifier load={loadPartnerCalendarNotifications} calendarPath="/partner/calendar" />
      {children}
    </AppShell>
  );
}
