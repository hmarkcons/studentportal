import { getStaffSession } from "@/lib/auth/session";
import { getCachedCounselors } from "@/lib/cachedQueries";
import { XLSX, leadWorkbook } from "@/lib/leadWorkbook";

/**
 * The leads import template: the leads list's columns, an example row the
 * import skips, the Month worked out from the Inquiry date, and dropdowns of
 * the levels, statuses and active counsellors. Staff only — it names the
 * counsellors.
 */
export async function GET() {
  const { staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });
  const buffer = await leadWorkbook([], { counselors: await getCachedCounselors(), example: true });
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": 'attachment; filename="leads-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
