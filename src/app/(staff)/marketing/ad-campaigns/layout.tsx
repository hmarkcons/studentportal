import { PageGuard } from "@/components/PageGuard";

// Who may open /marketing/ad-campaigns and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/marketing/ad-campaigns">{children}</PageGuard>;
}
