import { createClient } from "@/lib/supabase/server";
import { NewApplicationForStudent } from "./NewApplicationForStudent";
import { ApplicationsByStudent, type StudentApplicationGroup } from "./ApplicationsByStudent";

type Destination = { display_name: string };
type University = { name: string; city: string | null; destination: Destination | Destination[] | null };
type Program = { name: string };

type StudentEmbed = {
  full_name: string;
  registered_at: string | null;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
};

type Row = {
  id: string;
  student_id: string;
  current_stage: string;
  deadline: string | null;
  university: University | University[] | null;
  program: Program | Program[] | null;
  student: StudentEmbed | StudentEmbed[] | null;
};

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default async function ApplicationsBoardPage() {
  const supabase = await createClient();

  const { data: applications, error } = await supabase
    .from("applications")
    .select(
      `id, student_id, current_stage, deadline,
       university:universities(name, city, destination:destinations(display_name)),
       program:programs(name),
       student:leads(full_name, registered_at, assigned_counselor:staff(full_name))`
    )
    .returns<Row[]>();

  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");

  const byStudent = new Map<string, StudentApplicationGroup>();
  (applications ?? []).forEach((app) => {
    const student = one(app.student);
    const name = student?.full_name ?? "Unknown";
    const university = one(app.university);
    const destination = university ? one(university.destination) : null;
    const program = one(app.program);
    const country = destination?.display_name ?? "—";

    if (!byStudent.has(app.student_id)) {
      const counselorName = student?.assigned_counselor ? one(student.assigned_counselor)?.full_name ?? null : null;
      const registeredMonth = student?.registered_at
        ? new Date(student.registered_at).toLocaleString("en-US", { month: "short", year: "numeric" })
        : null;
      byStudent.set(app.student_id, {
        id: app.student_id,
        name,
        countries: [],
        apps: [],
        counselorName,
        counselorInitials: counselorName ? initials(counselorName) : null,
        registeredMonth,
      });
    }
    const group = byStudent.get(app.student_id)!;
    if (!group.countries.includes(country)) group.countries.push(country);
    group.apps.push({
      id: app.id,
      university: university?.name ?? "Unknown university",
      city: university?.city ?? null,
      country,
      program: program?.name ?? "No program selected",
      stage: app.current_stage,
      deadline: app.deadline,
      href: `/students/${app.student_id}/applications/${app.id}`,
    });
  });

  const groups = [...byStudent.values()].sort((a, b) => a.name.localeCompare(b.name));
  const allCountries = Array.from(new Set(groups.flatMap((g) => g.countries).filter((c) => c !== "—"))).sort();

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Applications</h2>
        <NewApplicationForStudent students={students ?? []} />
      </div>
      {error && <p className="text-sm text-danger">{error.message}</p>}
      {!error && <ApplicationsByStudent groups={groups} allCountries={allCountries} />}
    </div>
  );
}
