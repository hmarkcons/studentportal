import { PageGuard } from "@/components/PageGuard";

// Who may open /marketing/email and everything under it — src/lib/pageAccess.ts.
export default function EmailCampaignsLayout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/marketing/email">{children}</PageGuard>;
}
