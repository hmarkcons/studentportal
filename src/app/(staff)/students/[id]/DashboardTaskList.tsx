"use client";

import { useActionState, useState } from "react";
import { addApplicationTask, toggleApplicationTask, deleteApplicationTask } from "@/lib/actions/applications";

export type DashboardTaskRow = {
  id: string;
  description: string;
  due_date: string | null;
  status: string;
  priority: string;
  applicationLabel: string;
};

const PRIORITY_TONE: Record<string, string> = {
  urgent: "border-danger text-danger",
  medium: "border-warning text-warning",
  low: "border-border text-muted",
};

export function DashboardTaskList({
  tasks,
  applications,
  studentId,
}: {
  tasks: DashboardTaskRow[];
  applications: { id: string; label: string }[];
  studentId: string;
}) {
  const revalidateTo = `/students/${studentId}`;
  const [applicationId, setApplicationId] = useState(applications[0]?.id ?? "");
  const action = addApplicationTask.bind(null, applicationId, "", revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 && <p className="text-sm text-muted">No tasks yet.</p>}
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.status === "done"}
              onChange={(e) => toggleApplicationTask(t.id, revalidateTo, e.target.checked)}
            />
            <span className={t.status === "done" ? "flex-1 text-muted line-through" : "flex-1 text-ink"}>
              {t.description} <span className="text-muted">· {t.applicationLabel}</span>
            </span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase ${PRIORITY_TONE[t.priority] ?? PRIORITY_TONE.medium}`}>
              {t.priority}
            </span>
            {t.due_date && <span className="text-xs text-muted">due {new Date(t.due_date).toLocaleDateString()}</span>}
            <button onClick={() => deleteApplicationTask(t.id, revalidateTo)} className="text-xs text-muted hover:text-danger">
              🗑️
            </button>
          </div>
        ))}
      </div>

      {applications.length > 0 && (
        <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} className="rounded-md border border-border px-2 py-1.5 text-sm">
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <input name="description" placeholder="Task" required className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
          <input name="due_date" type="date" className="rounded-md border border-border px-2 py-1.5 text-sm" />
          <select name="priority" defaultValue="medium" className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="urgent">Urgent</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button type="submit" disabled={pending} className="rounded-md border border-primary px-2 py-1.5 text-xs font-medium text-primary disabled:opacity-50">
            Add
          </button>
        </form>
      )}
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
