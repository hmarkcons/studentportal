import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { NewItemForm } from "./NewItemForm";
import { ItemRow } from "./ItemRow";
import { RequestForm } from "./RequestForm";
import { RequestQueue } from "./RequestQueue";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function InventoryPage() {
  const { supabase } = await getStaffSession();
  // inventory.manage rather than a role test, so granting it to another role
  // in Admin > Role Permissions changes what the page offers and not only what
  // the server accepts. The actions have always asked for the permission; the
  // page asked for the role.
  const canManage = await hasPermission("inventory.manage");

  const { data: items } = await supabase.from("inventory_items").select("*").order("name");
  // Every pending request, plus a window of decided ones. Unbounded, this
   // query grew with every request ever raised and the page would eventually
   // load years of settled history to show a handful of open items. Pending
   // ones are never dropped, because those are the ones somebody is waiting on.
  const [{ data: pendingRequests }, { data: decidedRequests }] = await Promise.all([
    supabase
      .from("inventory_requests")
      .select("id, quantity, status, notes, item_name, created_at, item:inventory_items(name), requester:staff(full_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("inventory_requests")
      .select("id, quantity, status, notes, item_name, created_at, item:inventory_items(name), requester:staff(full_name)")
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const requests = [...(pendingRequests ?? []), ...(decidedRequests ?? [])];

  const requestRows = requests.map((r) => {
    const item = one(r.item as never) as { name?: string } | null;
    const requester = one(r.requester as never) as { full_name?: string } | null;
    return {
      id: r.id,
      quantity: r.quantity,
      status: r.status,
      notes: r.notes,
      // The live item, then the name snapshotted when the request was raised.
      // item_id is ON DELETE SET NULL, so without the snapshot a request for a
      // since-deleted item read "Item × 5".
      itemName: item?.name ?? r.item_name ?? "Item no longer listed",
      itemDeleted: !item,
      // requested_by is ON DELETE SET NULL now (migration 0150), so a request
      // outlives the person who raised it rather than blocking their deletion.
      requesterName: requester?.full_name ?? "Former staff member",
      createdAt: r.created_at,
    };
  });

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Inventory & Requirements</h2>

      {canManage && (
        <Card className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Add item</h3>
          <NewItemForm />
        </Card>
      )}

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Stock</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">On hand</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => (
                <ItemRow key={item.id} item={item} canManage={canManage} />
              ))}
              {(!items || items.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    No items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Requests</h3>
        <RequestForm items={(items ?? []).map((i) => ({ id: i.id, name: i.name }))} />
        <div className="mt-4 border-t border-border pt-4">
          <RequestQueue requests={requestRows} canManage={canManage} />
        </div>
      </Card>
    </div>
  );
}
