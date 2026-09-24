import { PageGuard } from "@/components/PageGuard";

// Who may open /calendar and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/calendar">{children}</PageGuard>;
}
