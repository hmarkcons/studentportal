import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { STAGE_LABELS } from "@/lib/stages";
import { isStalled } from "@/lib/stall";

type StudentRow = {
  id: string;
  full_name: string;
  destination_country: string;
  current_stage: string;
  updated_at: string;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
};

function counselorName(row: StudentRow["assigned_counselor"]) {
  if (!row) return "Unassigned";
  return Array.isArray(row) ? row[0]?.full_name ?? "Unassigned" : row.full_name;
}

export default async function StudentsPage() {
  const supabase = await createClient();

  const { data: students, error } = await supabase
    .from("students")
    .select(
      "id, full_name, destination_country, current_stage, updated_at, assigned_counselor:staff(full_name)"
    )
    .order("updated_at", { ascending: false })
    .returns<StudentRow[]>();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <AppHeader active="students" />

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50">Students</h2>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {students?.length ?? 0} case{students?.length === 1 ? "" : "s"}
              </span>
            </div>
            <Link
              href="/students/new"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              + New case
            </Link>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              Couldn&apos;t load students: {error.message}
            </p>
          )}

          {!error && (!students || students.length === 0) && (
            <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No students yet.{" "}
                <Link href="/students/new" className="underline">
                  Create the first case
                </Link>
                .
              </p>
            </div>
          )}

          {students && students.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-100/60 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 font-medium">Counselor</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr
                      key={student.id}
                      className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/40"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                        <Link href={`/students/${student.id}`} className="hover:underline">
                          {student.full_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {student.destination_country}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {STAGE_LABELS[student.current_stage as keyof typeof STAGE_LABELS] ?? student.current_stage}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {counselorName(student.assigned_counselor)}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-500">
                        <span className="inline-flex items-center gap-1.5">
                          {new Date(student.updated_at).toLocaleDateString()}
                          {isStalled(student.updated_at, student.current_stage) && (
                            <span
                              title="No movement in 7+ days"
                              className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                            >
                              stalled
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
