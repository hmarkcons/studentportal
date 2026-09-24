import { PageGuard } from "@/components/PageGuard";

// Who may open /admin/audit-log and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/admin/audit-log">{children}</PageGuard>;
}
