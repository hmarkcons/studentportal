import { PageGuard } from "@/components/PageGuard";

// Who may open /setup/scholarship-bodies and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/setup/scholarship-bodies">{children}</PageGuard>;
}
