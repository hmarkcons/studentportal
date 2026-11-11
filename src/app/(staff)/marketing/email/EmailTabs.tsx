import { SectionTabs } from "@/components/SectionTabs";

// The Email campaigns section's tabs.
export function EmailTabs({ active }: { active: "campaigns" | "reports" | "templates" | "audience" | "settings" }) {
  return (
    <SectionTabs
      active={active}
      tabs={[
        { key: "campaigns", label: "Campaigns", href: "/marketing/email/campaigns" },
        { key: "reports", label: "Reports", href: "/marketing/email/reports" },
        { key: "templates", label: "Templates", href: "/marketing/email/templates" },
        { key: "audience", label: "Audience", href: "/marketing/email/audience" },
        { key: "settings", label: "Settings", href: "/marketing/email/settings" },
      ]}
    />
  );
}

/** A time as the office reads it: in Karachi. */
export function karachiTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
