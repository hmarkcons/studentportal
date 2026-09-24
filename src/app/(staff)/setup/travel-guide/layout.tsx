import { PageGuard } from "@/components/PageGuard";

// Who may open /setup/travel-guide and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/setup/travel-guide">{children}</PageGuard>;
}
