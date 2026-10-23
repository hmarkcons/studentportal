import { PageGuard } from "@/components/PageGuard";

// Who may open /social and everything under it — src/lib/pageAccess.ts
// (page.social). The data underneath is also RLS-limited to the social-capable
// roles (0344); this is the section's front door.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/social">{children}</PageGuard>;
}
