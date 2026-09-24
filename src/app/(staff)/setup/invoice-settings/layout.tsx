import { PageGuard } from "@/components/PageGuard";

// Who may open /setup/invoice-settings and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/setup/invoice-settings">{children}</PageGuard>;
}
