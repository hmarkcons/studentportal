import { createClient } from "@/lib/supabase/server";
import { PortalHeader } from "@/components/PortalHeader";
import { STAGES, STAGE_LABELS } from "@/lib/stages";
import { PortalUploadForm } from "./PortalUploadForm";

type StudentRow = {
  id: string;
  full_name: string;
  destination_country: string;
  current_stage: string;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
};

type StageHistoryRow = { id: string; stage: string; entered_at: string };

type DocumentRow = {
  id: string;
  status: string;
  file_path: string | null;
  template: { document_name: string; required: boolean; sort_order: number } | { document_name: string; required: boolean; sort_order: number }[] | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

const STATUS_LABELS: Record<string, string> = {
  missing: "Missing",
  submitted: "Submitted — awaiting review",
  under_review: "Under review",
  verified: "Verified",
  rejected: "Rejected — please re-upload",
};

const STATUS_STYLES: Record<string, string> = {
  missing: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  under_review: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  verified: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

export default async function PortalPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, destination_country, current_stage, assigned_counselor:staff(full_name)")
    .eq("auth_user_id", user?.id ?? "")
    .maybeSingle<StudentRow>();

  if (!student) {
    return (
      <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
        <PortalHeader name={user?.email ?? ""} />
        <main className="flex-1 px-6 py-16 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No case is linked to this account yet. Contact your counselor.
          </p>
        </main>
      </div>
    );
  }

  const stageIndex = STAGES.indexOf(student.current_stage as (typeof STAGES)[number]);

  const { data: history } = await supabase
    .from("stage_history")
    .select("id, stage, entered_at")
    .eq("student_id", student.id)
    .order("entered_at", { ascending: false })
    .returns<StageHistoryRow[]>();

  const { data: documents } = await supabase
    .from("student_documents")
    .select("id, status, file_path, template:document_templates(document_name, required, sort_order)")
    .eq("student_id", student.id)
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

  const counselorName = one(student.assigned_counselor)?.full_name;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <PortalHeader name={student.full_name} />
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Your application &middot; {student.destination_country}
            </h2>
            {counselorName && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Counselor: {counselorName}</p>
            )}

            <div className="mt-5 flex items-center gap-1 overflow-x-auto pb-2">
              {STAGES.map((stage, i) => (
                <div key={stage} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`h-1.5 w-full rounded-full ${
                      i <= stageIndex ? "bg-zinc-900 dark:bg-zinc-50" : "bg-zinc-200 dark:bg-zinc-800"
                    }`}
                  />
                  <span
                    className={`text-center text-[10px] leading-tight ${
                      i === stageIndex
                        ? "font-medium text-zinc-900 dark:text-zinc-50"
                        : "text-zinc-400 dark:text-zinc-600"
                    }`}
                  >
                    {STAGE_LABELS[stage]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">Your documents</h3>
            {sortedDocuments.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing to upload yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
                {sortedDocuments.map((doc) => {
                  const tpl = one(doc.template);
                  return (
                    <div key={doc.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-zinc-900 dark:text-zinc-50">
                          {tpl?.document_name}
                          {!tpl?.required && (
                            <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-600">(optional)</span>
                          )}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[doc.status]}`}>
                            {STATUS_LABELS[doc.status]}
                          </span>
                          {documentLinks.has(doc.id) && (
                            <a
                              href={documentLinks.get(doc.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                            >
                              View file
                            </a>
                          )}
                        </div>
                      </div>
                      {doc.status !== "verified" && <PortalUploadForm studentId={student.id} documentId={doc.id} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">Journey so far</h3>
            {!history || history.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No history yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {history.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {STAGE_LABELS[entry.stage as keyof typeof STAGE_LABELS] ?? entry.stage}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(entry.entered_at).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
