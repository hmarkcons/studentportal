import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const { staff, supabase } = await getStaffSession();
  if (!staff || staff.status !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawQ = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  // Strip characters with special meaning in a PostgREST .or() filter string
  // (comma separates conditions, parens group them) so a search term can't
  // break out of the intended full_name/email/contact_number filter.
  const q = rawQ.replace(/[,()%*]/g, "");
  if (q.length < 2) return NextResponse.json({ students: [], universities: [] });

  const like = `%${q}%`;

  const [{ data: students }, { data: universities }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, full_name, email, registered_at")
      .or(`full_name.ilike.${like},email.ilike.${like},contact_number.ilike.${like}`)
      .limit(8),
    supabase.from("universities").select("id, name").ilike("name", like).limit(5),
  ]);

  return NextResponse.json({
    students: (students ?? []).map((s) => ({
      id: s.id,
      label: s.full_name,
      sublabel: s.email ?? "",
      href: s.registered_at ? `/students/${s.id}` : `/leads/${s.id}`,
    })),
    universities: (universities ?? []).map((u) => ({
      id: u.id,
      label: u.name,
      sublabel: "University",
      href: `/setup/universities/${u.id}`,
    })),
  });
}
