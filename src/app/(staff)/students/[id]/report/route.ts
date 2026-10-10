import type { NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
import { seesStagesOnly } from "@/lib/auth/studentAccess";
import { canOpenPath } from "@/lib/pageAccess";
import { loadStudentReport } from "@/lib/studentReportLoad";
import { renderStudentReport } from "@/lib/pdf/studentReportPdf";
import { reportFileName } from "@/lib/studentReport";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refuse = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * A registered student's status report, as a PDF to download: everything on
 * their record, each item done, in progress, to do, sent back or not needed
 * (src/lib/studentReport.ts), from the Dashboard's "Status report" button.
 *
 * For staff who may open the student's page. A route handler is not wrapped
 * by the students layout's PageGuard, so the same check is made here; and a
 * counsellor who follows a registered student's stages only is refused, as
 * the Dashboard refuses them everything but the stages. What is in the
 * report is read through the viewer's own session, so row-level security
 * leaves out of it what it leaves off their tabs.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return refuse(404, "No such student.");

  const { supabase, staff } = await getStaffSession();
  if (!staff) return refuse(401, "Sign in to download the report.");
  const perms = await getEffectivePermissions();
  if (!canOpenPath("/students", perms, hasRole(staff, "super_admin"))) return refuse(403, "You do not have access to students.");
  if (seesStagesOnly(staff)) return refuse(403, "The status report is for the processing team; a counsellor follows a registered student's stages.");

  const data = await loadStudentReport(supabase, id, staff);
  if (!data) return refuse(404, "No such student, or not one you can see.");

  const pdf = await renderStudentReport(data);
  const name = reportFileName(data.student.name, data.student.code, data.today);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
    },
  });
}
