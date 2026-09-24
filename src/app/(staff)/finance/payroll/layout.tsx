import { PageGuard } from "@/components/PageGuard";

// Who may open /finance/payroll and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/finance/payroll">{children}</PageGuard>;
}
