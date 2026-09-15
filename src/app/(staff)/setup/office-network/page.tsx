import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { OfficeNetworkPanel, type NetworkRow } from "./OfficeNetworkPanel";
import { AccessRequests, type AccessRow } from "./AccessRequests";
import { currentRequestIp, listOffsiteAccess } from "@/lib/actions/officeAccess";

export const dynamic = "force-dynamic";

/**
 * The office network, and who may work outside it.
 *
 * Both on one page because they are one decision: the list says where the
 * office is, and the queue is the exceptions to it. Splitting them would mean
 * approving somebody without being able to see whether the address they are
 * on ought to have been on the list in the first place.
 */
export default async function OfficeNetworkPage() {
  const supabase = await createClient();
  const canDecide = await hasPermission("staff.approve_offsite_access");

  const [{ data: networks }, ip, access] = await Promise.all([
    supabase.from("office_networks").select("id, label, network, note").order("label"),
    currentRequestIp(),
    listOffsiteAccess(),
  ]);

  return (
    <div className="w-full max-w-4xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Office network</h2>
      <p className="mb-5 max-w-3xl text-sm text-muted">
        Staff on the office network sign in and stay signed in, as they always have. From anywhere else they reach a
        waiting screen and nothing at all until Management or a Super Admin approves them, and that approval runs out
        rather than quietly becoming permanent. A Super Admin is never held at the door &mdash; somebody has to be able
        to fix this list if the office address changes.
      </p>

      <Card className="mb-5">
        <h3 className="mb-1 text-sm font-semibold text-ink">Where the office is</h3>
        <p className="mb-3 text-xs text-muted">
          Every address or range here counts as the office. Adding one hands out access to every record in the system,
          so only a Super Admin can change it.
        </p>
        <OfficeNetworkPanel
          networks={(networks ?? []) as NetworkRow[]}
          currentIp={ip}
          canEdit={canDecide}
        />
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-ink">Working from elsewhere</h3>
        <p className="mb-3 text-xs text-muted">
          {canDecide
            ? "Requests from staff signing in away from the office, and who currently holds an approval."
            : "Only Management and Super Admin can see or decide these."}
        </p>
        {"error" in access && access.error ? (
          <p className="text-xs text-muted">{access.error}</p>
        ) : (
          <AccessRequests
            pending={(access.pending ?? []) as AccessRow[]}
            granted={(access.granted ?? []) as AccessRow[]}
            history={((access as { history?: AccessRow[] }).history ?? []) as AccessRow[]}
            canDecide={canDecide}
          />
        )}
      </Card>
    </div>
  );
}
