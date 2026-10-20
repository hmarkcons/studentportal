import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
import { canOpenPath } from "@/lib/pageAccess";
import { readProgrammeIndex } from "@/lib/catalogueExportLoad";

/**
 * Every programme's name, level and fields, for the search on Setup ›
 * Universities to find universities by what they teach.
 *
 * Asked for by the page only once somebody reaches for the search: the whole
 * list is ~400 KB, and most visits to the page never search it. Each
 * university is named once and its programmes point at it by place, which
 * takes a quarter off; the rest compresses on the way.
 */
export async function GET() {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });
  if (!canOpenPath("/setup/universities", await getEffectivePermissions(), hasRole(staff, "super_admin"))) {
    return new Response("Not authorized", { status: 403 });
  }

  const rows = await readProgrammeIndex(supabase);
  const universities: string[] = [];
  const place = new Map<string, number>();
  const programmes = rows.map((p) => {
    let at = place.get(p.university_id);
    if (at === undefined) {
      at = universities.push(p.university_id) - 1;
      place.set(p.university_id, at);
    }
    return [at, p.name, p.level, [p.core_field, p.sub_field].filter(Boolean).join(" / ")] as const;
  });

  return Response.json({ universities, programmes }, { headers: { "Cache-Control": "private, no-store" } });
}
