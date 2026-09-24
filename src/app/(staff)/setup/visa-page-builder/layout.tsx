import { PageGuard } from "@/components/PageGuard";

// Who may open /setup/visa-page-builder and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/setup/visa-page-builder">{children}</PageGuard>;
}
