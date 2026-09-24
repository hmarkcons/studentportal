import { PageGuard } from "@/components/PageGuard";

// Who may open /setup/guide-videos and everything under it — src/lib/pageAccess.ts.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/setup/guide-videos">{children}</PageGuard>;
}
