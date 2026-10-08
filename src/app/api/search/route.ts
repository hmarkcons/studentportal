import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth/session";
import { ilikeAny, searchTerm } from "@/lib/listSearch";
import { loginEmailMatches } from "@/lib/loginEmailSearch";

export async function GET(request: NextRequest) {
  const { staff, supabase } = await getStaffSession();
  if (!staff || staff.status !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The same words the lists search with (src/lib/listSearch.ts): nothing that
  // could break out of the filter, an email address's underscore kept.
  const q = searchTerm(request.nextUrl.searchParams.get("q"));
  if (q.length < 2) return NextResponse.json({ students: [], universities: [] });

  const like = `%${q}%`;

  const [loginHits, { data: found }, { data: universities }] = await Promise.all([
    // A student's portal sign-in address counts too, where it is not the one on their record (0327).
    loginEmailMatches(supabase, q),
    supabase.from("leads").select("id, full_name, email, registered_at").or(ilikeAny(["full_name", "email", "contact_number", "student_code"], q)).limit(8),
    supabase.from("universities").select("id, name").ilike("name", like).limit(5),
  ]);
  // Read only when a sign-in address matched someone the search above did not find.
  const missing = loginHits.filter((id) => !(found ?? []).some((s) => s.id === id)).slice(0, 8);
  const { data: byLogin } = missing.length
    ? await supabase.from("leads").select("id, full_name, email, registered_at").in("id", missing)
    : { data: [] as { id: string; full_name: string; email: string | null; registered_at: string | null }[] };
  const students = [...(found ?? []), ...(byLogin ?? [])].slice(0, 8);

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
