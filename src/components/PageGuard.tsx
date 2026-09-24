import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
import { canOpenPath } from "@/lib/pageAccess";
import { Card } from "@/components/ui/Card";

/**
 * Stands in front of a section's pages: renders them for someone whose role
 * may open that page (src/lib/pageAccess.ts), and says so plainly for anyone
 * else — so a page hidden from the menu cannot be reached by typing its
 * address either.
 *
 * Used from a layout.tsx in each gated folder, which is what makes it cover
 * the section's detail pages too (/students/<id>, /setup/universities/<id>).
 * The data underneath has its own row-level security; this is the page's
 * front door, not the only lock.
 */
export async function PageGuard({ path, children }: { path: string; children: React.ReactNode }) {
  const { staff } = await getStaffSession();
  const perms = await getEffectivePermissions();
  if (canOpenPath(path, perms, hasRole(staff, "super_admin"))) return <>{children}</>;

  return (
    // The marker is on a wrapper of our own: Card passes on only className.
    <div data-no-page-access>
      <Card className="mt-6 max-w-xl">
        <h2 className="text-base font-semibold text-ink">You don&apos;t have access to this page</h2>
        <p className="mt-1 text-sm text-muted">
          Your role isn&apos;t allowed to open it. If you need it for your work, ask a Super Admin to allow it for your role on
          the Role Permissions screen.
        </p>
        <Link href="/dashboard" className="mt-3 inline-block w-fit text-sm font-medium text-primary hover:underline">
          Back to the dashboard
        </Link>
      </Card>
    </div>
  );
}
