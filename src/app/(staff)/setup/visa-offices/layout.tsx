import { PageGuard } from "@/components/PageGuard";

// Who may open /setup/visa-offices and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/setup/visa-offices">{children}</PageGuard>;
}
