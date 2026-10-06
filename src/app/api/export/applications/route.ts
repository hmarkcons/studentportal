import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { loadApplicationRows } from "@/lib/applicationRows";
import { orderedApplicationColumns, stageGroup, type ApplicationColumnKey, type StageGroup } from "@/lib/applicationTable";
import { applicationCellText } from "@/lib/applicationText";
import { orderCycles, type Cycle } from "@/lib/intakeCycle";
import { XLSX } from "@/lib/leadWorkbook";

/** Columns wide enough for what they usually hold, in Excel's character widths. */
const WIDTH: Partial<Record<ApplicationColumnKey, number>> = {
  student: 26,
  student_code: 20,
  priority: 9,
  country: 14,
  university: 36,
  city: 14,
  program: 40,
  level: 12,
  intake: 14,
  round: 18,
  deadline: 13,
  stage: 24,
  fee: 16,
  requirements: 40,
  finalized: 18,
  remark: 48,
  tasks: 14,
  counselor: 20,
  officer: 20,
  portal_link: 36,
  page_link: 36,
  requirements_link: 36,
  coordinator_email: 30,
  university_email: 30,
  updated: 13,
};

/** Each row tinted as the table tints it: offers green, rejections red, the withdrawn grey. */
const TINT: Partial<Record<StageGroup, string>> = {
  accepted: "#E7F6EC",
  closed: "#F1F3F5",
  rejected: "#FDE7E7",
};

/**
 * The applications table as a workbook: every application the viewer can see,
 * or one student's (?student=, and ?cycle= for one intake), in the table's
 * order — offers first, rejections last — with its columns in the order a
 * Super Admin arranged them (0319).
 *
 * Read through the viewer's own session, so RLS decides whose applications
 * are in it, and paged (loadApplicationRows): PostgREST stops at 1000 rows.
 */
export async function GET(request: Request) {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });

  const params = new URL(request.url).searchParams;
  const studentId = params.get("student") || undefined;
  const cycleId = params.get("cycle");

  const [{ rows: all }, { data: savedOrder }, cycleRows] = await Promise.all([
    loadApplicationRows(supabase, { studentId }),
    supabase.from("list_column_orders").select("column_keys").eq("list_key", "applications").maybeSingle(),
    studentId && cycleId
      ? supabase.from("student_cycles").select("id, sequence, intake, is_current").eq("student_id", studentId).then((r) => r.data)
      : Promise.resolve(null),
  ]);

  // One intake of a student's: an application from before cycles existed belongs to the first.
  const firstCycleId = cycleRows ? (orderCycles(cycleRows as Cycle[]).at(-1)?.id ?? null) : null;
  const rows = cycleId && cycleRows ? all.filter((r) => (r.cycleId ?? firstCycleId) === cycleId) : all;
  if (studentId) {
    [...rows]
      .sort((x, y) => (x.sortOrder ?? Number.MAX_SAFE_INTEGER) - (y.sortOrder ?? Number.MAX_SAFE_INTEGER) || x.createdAt.localeCompare(y.createdAt))
      .forEach((r, i) => (r.number = i + 1));
  }

  const columns = orderedApplicationColumns(savedOrder?.column_keys, studentId ? "student" : "all");
  const header = columns.map((c) => ({ value: c.header, type: String, fontWeight: "bold" as const, backgroundColor: "#E6F4EE" }));
  const body = rows.map((r) => {
    const tint = TINT[stageGroup(r.stage, r.pipeline)];
    const style = tint ? { backgroundColor: tint } : {};
    return columns.map((c) => {
      const text = applicationCellText(r, c.key);
      if ((c.key === "deadline" || c.key === "updated") && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return { type: Date, value: new Date(`${text}T00:00:00Z`), format: "yyyy-mm-dd", ...style };
      }
      if (c.key === "priority") return { type: Number, value: r.number, ...style };
      return { type: String, value: text || undefined, ...style };
    });
  });

  const buffer = await writeXlsxFile(
    [{ data: [header, ...body] as never, sheet: "Applications", columns: columns.map((c) => ({ width: WIDTH[c.key] ?? 16 })), stickyRowsCount: 1 }],
    { fontFamily: "Calibri", fontSize: 11 }
  ).toBuffer();

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const who = studentId ? (rows[0]?.studentName ?? "student").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() : "all";
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="applications-${who}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
