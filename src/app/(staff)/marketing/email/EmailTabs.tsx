import { SectionTabs } from "@/components/SectionTabs";

// The Email campaigns section's tabs. Campaigns, Audience and Reports join
// Templates and Settings as their phases are built.
export function EmailTabs({ active }: { active: "campaigns" | "templates" | "audience" | "settings" }) {
  return (
    <SectionTabs
      active={active}
      tabs={[
        { key: "campaigns", label: "Campaigns", href: "/marketing/email/campaigns" },
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
