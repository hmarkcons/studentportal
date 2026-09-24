import { PageGuard } from "@/components/PageGuard";

// Who may open /reports and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/reports">{children}</PageGuard>;
}
