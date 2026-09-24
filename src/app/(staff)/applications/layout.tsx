import { PageGuard } from "@/components/PageGuard";

// Who may open /applications and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/applications">{children}</PageGuard>;
}
