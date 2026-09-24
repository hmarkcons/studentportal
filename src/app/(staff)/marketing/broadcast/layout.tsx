import { PageGuard } from "@/components/PageGuard";

// Who may open /marketing/broadcast and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/marketing/broadcast">{children}</PageGuard>;
}
