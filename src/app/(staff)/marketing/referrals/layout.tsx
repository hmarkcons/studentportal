import { PageGuard } from "@/components/PageGuard";

// Who may open /marketing/referrals and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/marketing/referrals">{children}</PageGuard>;
}
