import { PageGuard } from "@/components/PageGuard";

// Who may open /marketing/social-calendar and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/marketing/social-calendar">{children}</PageGuard>;
}
