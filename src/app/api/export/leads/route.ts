import { getStaffSession } from "@/lib/auth/session";
import { getCachedCounselors } from "@/lib/cachedQueries";
import { readAll, readAllIn } from "@/lib/catalogueReads";
import { leadSheetRow, type ExportLead } from "@/lib/leadSheet";
import { XLSX, leadWorkbook } from "@/lib/leadWorkbook";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

type Row = {
  id: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  country_of_interest: string | null;
  current_qualification: string | null;
  level_applying_for: string | null;
  course_of_interest: string | null;
  status: string | null;
  date_of_inquiry: string | null;
  platform_source: string | null;
  counselor: { full_name: string } | { full_name: string }[] | null;
  current_remark: { body: string | null } | { body: string | null }[] | null;
};

/**
 * Every lead the viewer can see, as the leads workbook — the import
 * template's columns, so the file can be edited and imported straight back
 * (a lead on file is added to, never overwritten). The follow-up is the next
 * one not yet done.
 *
 * Read through the viewer's own session, so RLS decides whose leads are in
 * it, and paged: PostgREST stops at 1000 rows without a word.
 */
export async function GET() {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });

  const leads = await readAll<Row>((from, to) =>
    supabase
      .from("leads")
      .select(
        "id, full_name, contact_number, email, country_of_interest, current_qualification, level_applying_for, course_of_interest, status, date_of_inquiry, platform_source, counselor:staff!assigned_counselor_id(full_name), current_remark:lead_remark_current(body)"
      )
      .order("date_of_inquiry", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<Row[]>()
  );
  const followUps = await readAllIn(
    leads.map((l) => l.id),
    (chunk, from, to) =>
      supabase
        .from("reminders")
        .select("student_id, due_date, note")
        .eq("type", "follow_up")
        .eq("resolved", false)
        .in("student_id", chunk)
        .order("due_date")
        .order("id")
        .range(from, to)
        .returns<{ student_id: string; due_date: string; note: string | null }[]>()
  );
  const nextFollowUp = new Map<string, { date: string; note: string | null }>();
  for (const f of followUps) if (!nextFollowUp.has(f.student_id)) nextFollowUp.set(f.student_id, { date: f.due_date, note: f.note });

  const rows = leads.map((l) =>
    leadSheetRow({
      ...l,
      counselorName: one(l.counselor)?.full_name ?? null,
      remark: one(l.current_remark)?.body ?? null,
      nextFollowUp: nextFollowUp.get(l.id) ?? null,
    } satisfies ExportLead)
  );
  const buffer = await leadWorkbook(rows, { counselors: await getCachedCounselors() });
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="leads-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
