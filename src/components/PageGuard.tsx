import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
import { missingForPath } from "@/lib/pageAccess";
import { Card } from "@/components/ui/Card";

/**
 * Stands in front of a section's pages: renders them for someone whose role
 * may open that page (src/lib/pageAccess.ts), and says so plainly for anyone
 * else — so a page hidden from the menu cannot be reached by typing its
 * address either. An editor-only page also needs a permission to edit it,
 * and the refusal names the one that is missing, as Role Permissions lists it.
 *
 * Used from a layout.tsx in each gated folder, which is what makes it cover
 * the section's detail pages too (/students/<id>, /setup/universities/<id>).
 * The data underneath has its own row-level security; this is the page's
 * front door, not the only lock.
 */
export async function PageGuard({ path, children }: { path: string; children: React.ReactNode }) {
  const { supabase, staff } = await getStaffSession();
  const perms = await getEffectivePermissions();
  const missing = missingForPath(path, perms, hasRole(staff, "super_admin"));
  if (missing.length === 0) return <>{children}</>;

  const { data: defs } = await supabase.from("permission_definitions").select("key, label").in("key", missing);
  const labels = missing.map((k) => (defs ?? []).find((d) => d.key === k)?.label ?? k);
  const editing = !missing.some((k) => k.startsWith("page."));

  return (
    // The marker is on a wrapper of our own: Card passes on only className.
    <div data-no-page-access data-missing={missing.join(" ")}>
      <Card className="mt-6 max-w-xl">
        <h2 className="text-base font-semibold text-ink">You don&apos;t have access to this page</h2>
        <p className="mt-1 text-sm text-muted">
          {editing ? "This page is for changing settings your role isn't allowed to change" : "Your role isn't allowed to open it"} — it
          needs{" "}
          {labels.map((l, i) => (
            <span key={l}>
              {i > 0 && (i === labels.length - 1 ? " or " : ", ")}
              <strong className="font-medium text-ink">&ldquo;{l}&rdquo;</strong>
            </span>
          ))}
          . If you need it for your work, ask a Super Admin to allow it for your role on the Role Permissions screen.
        </p>
        <Link prefetch={false} href="/dashboard" className="mt-3 inline-block w-fit text-sm font-medium text-primary hover:underline">
          Back to the dashboard
        </Link>
      </Card>
    </div>
  );
}
