import type { SupabaseClient } from "@supabase/supabase-js";
import { avatarUrlMap } from "@/lib/storageUrls";

export type TeamPerson = {
  id: string;
  full_name: string;
  designation: string | null;
  mobile_official: string | null;
  email_official: string | null;
  photoUrl: string | null;
};

export type StudentTeam = { counsellor: TeamPerson | null; processingOfficer: TeamPerson | null };

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

type Row = Omit<TeamPerson, "photoUrl"> & { photo_path: string | null };

/**
 * The two people who look after a student — their counsellor and their
 * processing officer — as the staff Dashboard shows them to a colleague:
 * photo, name, designation, and the office number and email.
 *
 * Official contact only: 0285 withholds a staff member's personal phone and
 * email from every signed-in user, and asking for either would fail the whole
 * query, which is how the dashboard once rendered blank. A student may read
 * these two staff rows and no others (0289), and their photos (0291).
 *
 * The photos are signed through avatarUrlMap, whose URLs stay the same for an
 * hour, so the browser keeps its copy instead of fetching the picture again on
 * every visit. It is given only the paths the student's own read returned.
 */
export async function loadStudentTeam(supabase: SupabaseClient, studentId: string): Promise<StudentTeam> {
  const COLUMNS = "id, full_name, designation, mobile_official, email_official, photo_path";
  const { data } = await supabase
    .from("students")
    .select(`assigned_counselor:staff!assigned_counselor_id(${COLUMNS}), processing_officer:staff!processing_officer_id(${COLUMNS})`)
    .eq("id", studentId)
    .maybeSingle();

  const counsellor = one(data?.assigned_counselor as never) as Row | null;
  const officer = one(data?.processing_officer as never) as Row | null;
  const photos = await avatarUrlMap([counsellor?.photo_path, officer?.photo_path]);

  const person = (row: Row | null): TeamPerson | null =>
    row?.full_name
      ? {
          id: row.id,
          full_name: row.full_name,
          designation: row.designation,
          mobile_official: row.mobile_official,
          email_official: row.email_official,
          photoUrl: row.photo_path ? photos.get(row.photo_path) ?? null : null,
        }
      : null;

  return { counsellor: person(counsellor), processingOfficer: person(officer) };
}
