import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignOutButton } from "@/components/SignOutButton";
import { RequestAccessForm } from "./RequestAccessForm";
import { currentRequestIp, latestAccessRequest } from "@/lib/actions/officeAccess";
import { formatDateOnly } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

/**
 * Where a staff member lands when they sign in from outside the office.
 *
 * Deliberately a page of its own outside every route group: the staff shell
 * renders a full navigation, and offering a menu to somebody who may not
 * open any of it would be a page of dead ends.
 *
 * It says four things, because between them they stop the support call:
 * that they are signed in and it is not a password problem, what the portal
 * thinks their address is, who can let them in, and how to ask.
 */
export default async function AccessPendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const [{ data: staff }, pending, { count: networks }, ip] = await Promise.all([
    admin.from("staff").select("full_name, role").eq("id", user.id).maybeSingle(),
    latestAccessRequest(user.id),
    admin.from("office_networks").select("id", { count: "exact", head: true }),
    currentRequestIp(),
  ]);

  // Somebody who is allowed in has no business here — the gate lets them
  // through, so landing on this page means they typed the URL.
  const { data: state } = await supabase.rpc("staff_access_state", { p_ip: ip });
  if ((state as { allowed?: boolean } | null)?.allowed !== false) redirect("/");

  const approvedButLapsed = pending?.lapsed ?? false;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">Waiting for approval</p>
        <h1 className="mb-3 text-xl font-semibold text-ink">
          {staff?.full_name ? `${staff.full_name.split(/\s+/)[0]}, you` : "You"} are signed in, but not on the office
          network
        </h1>
        <p className="mb-4 text-sm leading-relaxed text-muted">
          Your password is fine &mdash; this is not a sign-in problem. The portal can only be used from the HMARK office
          unless Management or a Super Admin approves you for somewhere else.
        </p>

        <dl className="mb-5 flex flex-col gap-1 rounded-md border border-border bg-surface px-3 py-2 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Signed in as</dt>
            <dd className="text-ink">{staff?.full_name ?? user.email}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">This device&rsquo;s address</dt>
            {/* Shown so they can read it out to whoever is adding the office
                to the list, and so "it works at the office" is checkable. */}
            <dd className="font-mono text-ink">{ip ?? "could not be read"}</dd>
          </div>
          {(networks ?? 0) === 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Office network</dt>
              <dd className="text-warning">not configured</dd>
            </div>
          )}
        </dl>

        {pending?.status === "pending" ? (
          <div className="rounded-md border border-border bg-surface px-4 py-3">
            <p className="text-sm font-medium text-ink">Your request is waiting</p>
            <p className="mt-1 text-xs text-muted">
              Sent {formatDateOnly(pending.createdAt.slice(0, 10), { day: "numeric", month: "short" })}. Management and
              the Super Admin can see it. Reload this page once somebody has approved it.
            </p>
          </div>
        ) : (
          <>
            {pending?.status === "denied" && (
              <p className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
                Your last request was not approved. You can ask again if the situation has changed.
              </p>
            )}
            {approvedButLapsed && (
              <p className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
                You were approved to work from outside the office, and that approval has since{" "}
                {pending?.revoked ? "been withdrawn" : "run out"}. Ask again if you still need it.
              </p>
            )}
            <RequestAccessForm />
          </>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <p className="text-xs text-muted">
            At the office and still seeing this? The office address may have changed &mdash; tell a Super Admin the
            address above.
          </p>
          <SignOutButton variant="outline" size="sm">
            Sign out
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}
