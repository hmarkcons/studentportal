import { PageGuard } from "@/components/PageGuard";

// Who may open /finance/partner-commissions and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/finance/partner-commissions">{children}</PageGuard>;
}
