import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { STAGE_LABELS } from "@/lib/stages";
import { EditStudentForm } from "./EditStudentForm";

type StageHistoryRow = {
  id: string;
  stage: string;
  entered_at: string;
  moved_by: { full_name: string } | { full_name: string }[] | null;
};

function moverName(row: StageHistoryRow["moved_by"]) {
  if (!row) return "System";
  return Array.isArray(row) ? row[0]?.full_name ?? "System" : row.full_name;
}

export default async function StudentDetailPage(props: PageProps<"/students/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, full_name, role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const isAdmin = staffRow?.role === "admin";

  const { data: student, error } = await supabase
    .from("students")
    .select("id, full_name, email, phone, destination_country, current_stage, assigned_counselor_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !student) {
    notFound();
  }

  const { data: allStaff } = isAdmin
    ? await supabase.from("staff").select("id, full_name, role").order("full_name")
    : { data: [] };

  const { data: history } = await supabase
    .from("stage_history")
    .select("id, stage, entered_at, moved_by:staff(full_name)")
    .eq("student_id", id)
    .order("entered_at", { ascending: false })
    .returns<StageHistoryRow[]>();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <AppHeader active="students" />
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <Link href="/students" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
            &larr; Back to students
          </Link>
          <h2 className="mt-2 mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {student.full_name}
          </h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.3fr_1fr]">
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <EditStudentForm
                studentId={id}
                student={student}
                counselors={allStaff ?? []}
                canReassign={isAdmin}
              />
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">Timeline</h3>
              {!history || history.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No stage history yet.</p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {history.map((entry) => (
                    <li key={entry.id} className="border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {STAGE_LABELS[entry.stage as keyof typeof STAGE_LABELS] ?? entry.stage}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(entry.entered_at).toLocaleString()} &middot; {moverName(entry.moved_by)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
