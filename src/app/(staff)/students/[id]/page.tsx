import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { STAGE_LABELS } from "@/lib/stages";
import { EditStudentForm } from "./EditStudentForm";
import { UploadForm } from "./UploadForm";
import { NoteForm } from "./NoteForm";
import { ReminderForm, ResolveReminderButton } from "./ReminderForm";
import { DocumentStatusSelect } from "@/components/DocumentStatusSelect";
import { PortalAccessPanel } from "./PortalAccessPanel";

type StageHistoryRow = {
  id: string;
  stage: string;
  entered_at: string;
  moved_by: { full_name: string } | { full_name: string }[] | null;
};

type DocumentRow = {
  id: string;
  status: string;
  file_path: string | null;
  uploaded_at: string | null;
  template: { document_name: string; required: boolean; sort_order: number } | { document_name: string; required: boolean; sort_order: number }[] | null;
};

type NoteRow = {
  id: string;
  body: string;
  channel: string;
  created_at: string;
  author: { full_name: string } | { full_name: string }[] | null;
};

type ReminderRow = {
  id: string;
  due_date: string;
  resolved: boolean;
};

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function moverName(row: StageHistoryRow["moved_by"]) {
  return one(row)?.full_name ?? "System";
}

const STATUS_STYLES: Record<string, string> = {
  missing: "text-zinc-400 dark:text-zinc-600",
  submitted: "text-amber-600 dark:text-amber-400",
  under_review: "text-blue-600 dark:text-blue-400",
  verified: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-red-600 dark:text-red-400",
};

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
    .select("id, full_name, email, phone, destination_country, current_stage, assigned_counselor_id, auth_user_id")
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

  const { data: documents } = await supabase
    .from("student_documents")
    .select("id, status, file_path, uploaded_at, template:document_templates(document_name, required, sort_order)")
    .eq("student_id", id)
    .returns<DocumentRow[]>();

  const sortedDocuments = [...(documents ?? [])].sort(
    (a, b) => (one(a.template)?.sort_order ?? 0) - (one(b.template)?.sort_order ?? 0)
  );

  const documentLinks = new Map<string, string>();
  await Promise.all(
    sortedDocuments
      .filter((d) => d.file_path)
      .map(async (d) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path!, 3600);
        if (data?.signedUrl) documentLinks.set(d.id, data.signedUrl);
      })
  );

  const { data: notes } = await supabase
    .from("notes")
    .select("id, body, channel, created_at, author:staff(full_name)")
    .eq("student_id", id)
    .order("created_at", { ascending: false })
    .returns<NoteRow[]>();

  const { data: reminders } = await supabase
    .from("reminders")
    .select("id, due_date, resolved")
    .eq("student_id", id)
    .order("due_date", { ascending: true })
    .returns<ReminderRow[]>();

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

          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <PortalAccessPanel studentId={id} enabled={Boolean(student.auth_user_id)} />
          </div>

          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Documents &middot; {student.destination_country}
            </h3>
            {sortedDocuments.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No checklist for this destination yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
                {sortedDocuments.map((doc) => {
                  const tpl = one(doc.template);
                  return (
                    <div key={doc.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-[180px] flex-1">
                        <p className="text-sm text-zinc-900 dark:text-zinc-50">
                          {tpl?.document_name}
                          {!tpl?.required && (
                            <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-600">(optional)</span>
                          )}
                        </p>
                        {documentLinks.has(doc.id) && (
                          <a
                            href={documentLinks.get(doc.id)}
                            target="_blank"
                            rel="noreferrer"
                            className={`text-xs underline ${STATUS_STYLES[doc.status]}`}
                          >
                            View uploaded file
                          </a>
                        )}
                      </div>
                      <DocumentStatusSelect studentId={id} documentId={doc.id} status={doc.status} />
                      <UploadForm studentId={id} documentId={doc.id} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">Notes</h3>
              <NoteForm studentId={id} />
              <div className="mt-4 flex flex-col gap-3">
                {(!notes || notes.length === 0) && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No notes logged yet.</p>
                )}
                {notes?.map((note) => (
                  <div key={note.id} className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-800">
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">{note.body}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {note.channel} &middot; {one(note.author)?.full_name ?? "Unknown"} &middot;{" "}
                      {new Date(note.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">Deadlines</h3>
              <ReminderForm studentId={id} />
              <div className="mt-4 flex flex-col gap-2">
                {(!reminders || reminders.length === 0) && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No deadlines set.</p>
                )}
                {reminders?.map((reminder) => (
                  <div
                    key={reminder.id}
                    className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <span
                      className={`text-sm ${
                        reminder.resolved
                          ? "text-zinc-400 line-through dark:text-zinc-600"
                          : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {new Date(reminder.due_date).toLocaleDateString()}
                    </span>
                    {!reminder.resolved && <ResolveReminderButton studentId={id} reminderId={reminder.id} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
