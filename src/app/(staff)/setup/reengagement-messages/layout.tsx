import { PageGuard } from "@/components/PageGuard";

// Who may open /setup/reengagement-messages and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/setup/reengagement-messages">{children}</PageGuard>;
}
