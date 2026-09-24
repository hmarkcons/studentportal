import { PageGuard } from "@/components/PageGuard";

// Who may open /admin/attendance and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/admin/attendance">{children}</PageGuard>;
}
