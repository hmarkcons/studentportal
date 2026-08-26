import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NewItemForm } from "./NewItemForm";
import { ItemRow } from "./ItemRow";
import { RequestForm } from "./RequestForm";
import { RequestQueue } from "./RequestQueue";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function InventoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const canManage = staffRow?.role === "super_admin" || staffRow?.role === "management";

  const { data: items } = await supabase.from("inventory_items").select("*").order("name");
  const { data: requests } = await supabase
    .from("inventory_requests")
    .select("id, quantity, status, notes, item:inventory_items(name), requester:staff(full_name)")
    .order("created_at", { ascending: false });

  const requestRows = (requests ?? []).map((r) => {
    const item = one(r.item as never) as { name?: string } | null;
    const requester = one(r.requester as never) as { full_name?: string } | null;
    return {
      id: r.id,
      quantity: r.quantity,
      status: r.status,
      notes: r.notes,
      itemName: item?.name ?? "Item",
      requesterName: requester?.full_name ?? "Staff",
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
