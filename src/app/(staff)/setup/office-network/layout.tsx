import { PageGuard } from "@/components/PageGuard";

// Who may open /setup/office-network and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/setup/office-network">{children}</PageGuard>;
}
