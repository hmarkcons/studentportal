import { getStaffSession } from "@/lib/auth/session";
import { getCachedCounselors } from "@/lib/cachedQueries";
import { XLSX, leadWorkbook } from "@/lib/leadWorkbook";
import { orderedLeadColumns } from "@/lib/leadSheet";

/**
 * The leads import template: the leads list's columns, an example row the
 * import skips, the Month worked out from the Inquiry date, and dropdowns of
 * the levels, statuses and active counsellors. Staff only — it names the
 * counsellors.
 */
export async function GET() {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });
  // In the order a Super Admin arranged the list (0313).
  const { data: savedOrder } = await supabase.from("list_column_orders").select("column_keys").eq("list_key", "leads").maybeSingle();
  const buffer = await leadWorkbook([], { counselors: await getCachedCounselors(), example: true, columns: orderedLeadColumns(savedOrder?.column_keys) });
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": 'attachment; filename="leads-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
