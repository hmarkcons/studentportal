import { PageGuard } from "@/components/PageGuard";

// Who may open /admin/additional-services and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/admin/additional-services">{children}</PageGuard>;
}
