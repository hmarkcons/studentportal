import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";
import { NewApplicationForStudent } from "./NewApplicationForStudent";

type Row = {
  id: string;
  student_id: string;
  current_stage: string;
  university: { destination: { display_name: string; pipeline_stages: string[] } | { display_name: string; pipeline_stages: string[] }[] | null } | { destination: unknown }[] | null;
  student: { full_name: string } | { full_name: string }[] | null;
};

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function ApplicationsBoardPage() {
  const supabase = await createClient();

  const { data: applications, error } = await supabase
    .from("applications")
    .select(
      "id, student_id, current_stage, university:universities(destination:destinations(display_name, pipeline_stages)), student:leads(full_name)"
    )
    .returns<Row[]>();

  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");

  const byStudent = new Map<string, { name: string; rows: Row[] }>();
  (applications ?? []).forEach((app) => {
    const name = one(app.student)?.full_name ?? "Unknown";
    if (!byStudent.has(app.student_id)) byStudent.set(app.student_id, { name, rows: [] });
    byStudent.get(app.student_id)!.rows.push(app);
  });

  function counts(rows: Row[]) {
    let submitted = 0;
    let pending = 0;
    let offer = 0;
    for (const r of rows) {
      const uni = one(r.university as never) as { destination?: unknown } | null;
      const dest = uni?.destination ? (one(uni.destination as never) as { pipeline_stages?: string[] } | null) : null;
      const firstStage = dest?.pipeline_stages?.[0];
      if (r.current_stage === firstStage) pending++;
      else submitted++;
      if (r.current_stage.includes("offer")) offer++;
    }
    return { total: rows.length, submitted, pending, offer };
  }

  function countries(rows: Row[]) {
    const names = new Set<string>();
    for (const r of rows) {
      const uni = one(r.university as never) as { destination?: unknown } | null;
      const dest = uni?.destination ? (one(uni.destination as never) as { display_name?: string } | null) : null;
      if (dest?.display_name) names.add(dest.display_name);
    }
    return Array.from(names);
  }

  const columns = [
    { key: "student", header: "Student" },
    { key: "countries", header: "Countries" },
    { key: "total", header: "Total", align: "right" as const },
    { key: "submitted", header: "Submitted", align: "right" as const },
    { key: "pending", header: "Pending submission", align: "right" as const },
    { key: "offer", header: "With offer letters", align: "right" as const },
  ];

  const rows = [...byStudent.entries()].map(([studentId, { name, rows: appRows }]) => {
    const c = counts(appRows);
    const countryNames = countries(appRows);
    return {
      id: studentId,
      cells: {
        student: (
          <Link href={`/students/${studentId}/applications`} className="font-medium text-ink hover:text-primary">
            {name}
          </Link>
        ),
        countries: countryNames.join(", ") || "—",
        total: c.total,
        submitted: c.submitted,
        pending: c.pending,
        offer: c.offer,
      },
      csv: {
        student: name,
        countries: countryNames.join(", "),
        total: String(c.total),
        submitted: String(c.submitted),
        pending: String(c.pending),
        offer: String(c.offer),
      },
    };
  });

  const allCountries = Array.from(new Set(rows.flatMap((r) => r.csv.countries.split(", ").filter(Boolean)))).sort();

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Applications</h2>
        <NewApplicationForStudent students={students ?? []} />
      </div>
      {error && <p className="text-sm text-danger">{error.message}</p>}

      {!error && (
        <DataTable
          exportFilename="applications"
          rows={rows}
          columns={columns}
          searchable
          searchPlaceholder="Search student…"
          filters={allCountries.length > 0 ? [{ key: "countries", label: "Country", options: allCountries }] : []}
        />
      )}
    </div>
  );
}
