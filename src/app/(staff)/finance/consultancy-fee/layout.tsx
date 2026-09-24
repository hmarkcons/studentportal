import { PageGuard } from "@/components/PageGuard";

// Who may open /finance/consultancy-fee and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/finance/consultancy-fee">{children}</PageGuard>;
}
