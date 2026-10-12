"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";
import {
  addPeopleToTask,
  addTaskComment,
  addTaskFile,
  addTaskStep,
  deleteTask,
  deleteTaskComment,
  deleteTaskFile,
  getTaskDetail,
  removeFromTask,
  removeTaskStep,
  setTaskStatus,
  tickTaskStep,
  updateTask,
} from "@/lib/actions/staffTasks";
import {
  COMMENT_MAX,
  NOTES_MAX,
  PRIORITY_LABELS,
  STEP_MAX,
  TASK_FILE_ACCEPT,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TITLE_MAX,
  assignmentProgress,
  dueLabel,
  isOverdue,
  timeLabel,
  type TaskStatus,
} from "@/lib/staffTasks";
import type { TaskDetail, TaskPerson } from "@/lib/staffTasksLoad";
import { toast } from "@/lib/toast";
import { PeoplePicker } from "./PeoplePicker";
import { StudentPicker, type PickedStudent } from "./StudentPicker";
import { STATUS_TONE } from "./TaskCard";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const size = (bytes: number | null) => (bytes == null ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

type Done = { success?: boolean; error?: string } | undefined;

/** Changes the title, notes, day, time, priority or student. */
function EditForm({ detail, revalidateTo, onSaved, onCancel }: { detail: TaskDetail; revalidateTo: string; onSaved: () => void; onCancel: () => void }) {
  const t = detail.copy;
  const [state, action, pending] = useActionState(updateTask.bind(null, t.id, revalidateTo), undefined as Done);
  const [student, setStudent] = useState<PickedStudent | null>(t.studentId ? { id: t.studentId, label: t.studentName ?? "Student" } : null);
  useEffect(() => {
    if (state?.success) onSaved();
  }, [state, onSaved]);
  const everyone = detail.copies.length > 1 && (detail.can.assign || detail.can.delete);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border border-border p-3" data-edit-task>
      <FormField label="Task" htmlFor="edit-title">
        <Input id="edit-title" name="title" required maxLength={TITLE_MAX} defaultValue={t.title} />
      </FormField>
      <div className="grid grid-cols-3 gap-2">
        <FormField label="Due" htmlFor="edit-due">
          <Input id="edit-due" name="due_date" type="date" required defaultValue={t.due_date} />
        </FormField>
        <FormField label="Time" htmlFor="edit-time">
          <Input id="edit-time" name="due_time" type="time" step={900} defaultValue={timeLabel(t.due_time) ?? ""} />
        </FormField>
        <FormField label="Priority" htmlFor="edit-priority">
          <Select id="edit-priority" name="priority" defaultValue={t.priority}>
            <option value="urgent">Urgent</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </FormField>
      </div>
      <FormField label="About">
        <StudentPicker value={student} onChange={setStudent} />
      </FormField>
      <FormField label="Notes" htmlFor="edit-notes">
        <Textarea id="edit-notes" name="notes" rows={3} maxLength={NOTES_MAX} defaultValue={t.description ?? ""} />
      </FormField>
      {everyone && <p className="text-xs text-muted">Saved for everyone on the task.</p>}
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" pending={pending} data-save-task>
          Save
        </Button>
      </div>
    </form>
  );
}

/** Attaches a file to the task. */
function AttachForm({ taskId, onAttached }: { taskId: string; onAttached: () => void }) {
  const [round, setRound] = useState(0);
  // A fresh, empty field after each file attached.
  const [state, action, pending] = useActionState(async (prev: Done, form: FormData) => {
    const result = await addTaskFile(taskId, prev, form);
    if (result.success) {
      setRound((r) => r + 1);
      onAttached();
    }
    return result;
  }, undefined as Done);
  const [busy, setBusy] = useState(false);
  return (
    <form key={round} action={action} className="flex flex-col gap-2" data-attach-file>
      <FileField name="file" accept={TASK_FILE_ACCEPT} noun="file" hint="PDF, picture, Word, Excel, CSV or text" onChange={(s) => setBusy(s.busy)} />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <Button type="submit" size="sm" variant="outline-primary" pending={pending} disabled={busy} className="self-start" data-attach-submit>
        Attach
      </Button>
    </form>
  );
}

/**
 * One task, in full: where it stands and for whom, its checklist, its
 * comments and its files — opened from a card anywhere, or from an alert's
 * link (/tasks?task=<copy>).
 */
export function TaskPanel(props: {
  copyId: string | null;
  onClose: () => void;
  people: readonly TaskPerson[];
  me: string;
  today: string;
  /** Something changed: the list behind should be read again. */
  onChanged: () => void;
}) {
  // A panel of its own for each task, so nothing of the last one carries over.
  if (!props.copyId) return null;
  return <OpenTaskPanel key={props.copyId} {...props} copyId={props.copyId} />;
}

function OpenTaskPanel({
  copyId,
  onClose,
  people,
  me,
  today,
  onChanged,
}: {
  copyId: string;
  onClose: () => void;
  people: readonly TaskPerson[];
  me: string;
  today: string;
  onChanged: () => void;
}) {
  const pathname = usePathname() || "/tasks";
  const [detail, setDetail] = useState<TaskDetail | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<string[] | null>(null);
  const [step, setStep] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.full_name]));
    return (id: string | null) => (!id ? "Someone" : id === me ? "You" : (m.get(id) ?? "A former colleague"));
  }, [people, me]);

  const load = useCallback(async () => {
    setDetail(await getTaskDetail(copyId));
  }, [copyId]);

  // Read once on opening; every write below reads it again through load().
  useEffect(() => {
    let live = true;
    getTaskDetail(copyId).then((d) => {
      if (live) setDetail(d);
    });
    return () => {
      live = false;
    };
  }, [copyId]);

  /** Runs a write, says what went wrong if it did, and reads the task again. */
  const run = async (key: string, write: () => Promise<{ error?: string; success?: boolean } | undefined>, said?: string) => {
    setBusy(key);
    setProblem(null);
    try {
      const result = await write();
      if (result?.error) {
        setProblem(result.error);
        return false;
      }
      if (said) toast(said);
      await load();
      onChanged();
      return true;
    } finally {
      setBusy(null);
    }
  };

  const title = detail ? detail.copy.title : "Task";
  return (
    <SlideOver open onClose={onClose} title={title} wide>
      {detail === undefined && <p className="text-sm text-muted">Loading…</p>}
      {detail === null && <p className="text-sm text-muted">This task is not there any more, or it is not one you can see.</p>}
      {detail && (
        <TaskBody
          detail={detail}
          nameOf={nameOf}
          me={me}
          today={today}
          busy={busy}
          problem={problem}
          editing={editing}
          setEditing={setEditing}
          adding={adding}
          setAdding={setAdding}
          step={step}
          setStep={setStep}
          comment={comment}
          setComment={setComment}
          people={people}
          pathname={pathname}
          run={run}
          reload={async () => {
            await load();
            onChanged();
          }}
          onDeleted={() => {
            onChanged();
            onClose();
          }}
        />
      )}
    </SlideOver>
  );
}

function TaskBody({
  detail,
  nameOf,
  me,
  today,
  busy,
  problem,
  editing,
  setEditing,
  adding,
  setAdding,
  step,
  setStep,
  comment,
  setComment,
  people,
  pathname,
  run,
  reload,
  onDeleted,
}: {
  detail: TaskDetail;
  nameOf: (id: string | null) => string;
  me: string;
  today: string;
  busy: string | null;
  problem: string | null;
  editing: boolean;
  setEditing: (v: boolean) => void;
  adding: string[] | null;
  setAdding: (v: string[] | null) => void;
  step: string;
  setStep: (v: string) => void;
  comment: string;
  setComment: (v: string) => void;
  people: readonly TaskPerson[];
  pathname: string;
  run: (key: string, write: () => Promise<{ error?: string; success?: boolean } | undefined>, said?: string) => Promise<boolean>;
  reload: () => Promise<void>;
  onDeleted: () => void;
}) {
  const t = detail.copy;
  const taskId = t.taskId;
  const mineCopy = detail.copies.find((c) => c.ownerId === me) ?? null;
  // Steps are ticked on a copy: the viewer's own, else the one opened (whoever set it may tick for them).
  const tickCopy = mineCopy ?? detail.copies.find((c) => c.id === t.id) ?? null;
  // A tick shows at once; the server's answer confirms it, or takes it back.
  const [tickNow, setTickNow] = useState<Record<string, boolean>>({});
  const savedTicks = new Set(tickCopy?.ticked ?? []);
  const isTicked = (id: string) => tickNow[id] ?? savedTicks.has(id);
  const ticked = new Set(detail.steps.filter((s) => isTicked(s.id)).map((s) => s.id));
  const progress = assignmentProgress(detail.copies);
  const overdue = isOverdue(t, today);
  const setBy = detail.createdBy;
  const several = detail.copies.length > 1 || (setBy && setBy !== t.ownerId);

  return (
    <div className="flex flex-col gap-5" data-task-panel={t.id}>
      {problem && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {problem}
        </p>
      )}

      {/* ------------------------------------------------ where it stands */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {detail.can.progress ? (
            <div className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label="Stage">
              {TASK_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy !== null}
                  aria-pressed={t.status === s}
                  onClick={() => t.status !== s && run(`status-${s}`, () => setTaskStatus(t.id, s as TaskStatus, null), s === "done" ? "Marked done." : undefined)}
                  data-set-status={s}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    t.status === s ? (s === "done" ? "bg-success text-white" : s === "in_progress" ? "bg-warning text-white" : "bg-primary text-primary-ink") : "text-muted hover:bg-bg"
                  }`}
                >
                  {TASK_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          ) : (
            <Badge tone={STATUS_TONE[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge>
          )}
          <Badge tone={t.priority === "urgent" ? "danger" : "neutral"}>{PRIORITY_LABELS[t.priority]}</Badge>
          <span className={`text-sm ${overdue ? "font-medium text-danger" : "text-ink"}`}>{dueLabel(t.due_date, t.due_time, today, t.status)}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {t.studentId && (
            <>
              <dt className="text-muted">About</dt>
              <dd>
                {t.studentHref ? (
                  <Link prefetch={false} href={t.studentHref} className="text-primary hover:underline">
                    {t.studentName}
                  </Link>
                ) : (
                  t.studentName
                )}
              </dd>
            </>
          )}
          <dt className="text-muted">{t.assignedBy ? "Given by" : "Set by"}</dt>
          <dd className="text-ink">
            {nameOf(t.assignedBy ?? setBy ?? t.ownerId)}
            <span className="text-muted"> · {when(t.created_at)}</span>
          </dd>
          {t.completed_at && (
            <>
              <dt className="text-muted">Finished</dt>
              <dd className="text-ink">{when(t.completed_at)}</dd>
            </>
          )}
        </dl>
        {t.description && <p className="whitespace-pre-wrap rounded-md bg-bg px-3 py-2 text-sm text-ink">{t.description}</p>}
      </section>

      {/* ------------------------------------------------ who it is for */}
      {(several || detail.can.assign) && (
        <section className="flex flex-col gap-2" data-task-people>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {detail.copies.length > 1 ? `People · ${progress.label}` : "For"}
            </h4>
            {detail.can.assign && adding === null && (
              <button type="button" onClick={() => setAdding([])} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" data-add-people>
                <UserPlus aria-hidden className="h-3.5 w-3.5" />
                Add people
              </button>
            )}
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {detail.copies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm" data-copy-owner={c.ownerId}>
                <span className="text-ink">{nameOf(c.ownerId)}</span>
                <span className="flex items-center gap-2">
                  {detail.steps.length > 0 && (
                    <span className="text-xs text-muted">
                      {c.ticked.filter((id) => detail.steps.some((s) => s.id === id)).length}/{detail.steps.length} steps
                    </span>
                  )}
                  <Badge tone={STATUS_TONE[c.status]}>{TASK_STATUS_LABELS[c.status]}</Badge>
                  {detail.can.assign && detail.copies.length > 1 && c.ownerId !== me && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        if (confirm(`Take ${nameOf(c.ownerId)} off this task?`)) void run(`remove-${c.id}`, () => removeFromTask(c.id, pathname), "Taken off the task.");
                      }}
                      aria-label={`Take ${nameOf(c.ownerId)} off this task`}
                      className="rounded p-0.5 text-muted hover:bg-danger-bg hover:text-danger"
                    >
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {adding !== null && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <PeoplePicker people={people} me={me} value={adding} onChange={setAdding} name="add" exclude={detail.copies.map((c) => c.ownerId)} />
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={adding.length === 0}
                  pending={busy === "add"}
                  onClick={async () => {
                    if (await run("add", () => addPeopleToTask(t.id, adding, pathname), "Given to them too.")) setAdding(null);
                  }}
                  data-add-people-submit
                >
                  Give to {adding.length || ""} {adding.length === 1 ? "person" : "people"}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------ checklist */}
      <section className="flex flex-col gap-2" data-task-checklist>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Checklist{detail.steps.length ? ` · ${detail.steps.filter((s) => ticked.has(s.id)).length} of ${detail.steps.length}` : ""}
        </h4>
        {detail.steps.length > 0 && (
          <ul className="flex flex-col gap-1">
            {detail.steps.map((s) => (
              <li key={s.id} className="group flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ticked.has(s.id)}
                  disabled={!tickCopy || !detail.can.progress || busy !== null}
                  onChange={async (e) => {
                    if (!tickCopy) return;
                    const want = e.target.checked;
                    setTickNow((m) => ({ ...m, [s.id]: want }));
                    const saved = await run(`tick-${s.id}`, () => tickTaskStep(s.id, tickCopy.id, want));
                    if (!saved)
                      setTickNow((m) => {
                        const { [s.id]: _undone, ...rest } = m;
                        return rest;
                      });
                  }}
                  aria-label={s.label}
                  data-step={s.label}
                  className="accent-primary"
                />
                <span className={ticked.has(s.id) ? "text-muted line-through" : "text-ink"}>{s.label}</span>
                <button
                  type="button"
                  onClick={() => run(`unstep-${s.id}`, () => removeTaskStep(s.id))}
                  aria-label={`Remove the step "${s.label}"`}
                  className="ml-auto rounded p-0.5 text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run("step", () => addTaskStep(taskId, step))) setStep("");
          }}
        >
          <Input value={step} onChange={(e) => setStep(e.target.value)} maxLength={STEP_MAX} placeholder="Add a step" aria-label="Add a step" className="flex-1" />
          <Button type="submit" size="sm" variant="outline" pending={busy === "step"} disabled={!step.trim()}>
            Add
          </Button>
        </form>
      </section>

      {/* ------------------------------------------------ files */}
      <section className="flex flex-col gap-2" data-task-files>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Files{detail.files.length ? ` · ${detail.files.length}` : ""}</h4>
        {detail.files.length > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {detail.files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-3 py-1.5 text-sm" data-task-file={f.file_name}>
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline">
                    <Download aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{f.file_name}</span>
                  </a>
                ) : (
                  <span className="truncate text-ink">{f.file_name}</span>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {size(f.size_bytes)} · {nameOf(f.uploaded_by)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Take "${f.file_name}" off this task?`)) void run(`file-${f.id}`, () => deleteTaskFile(f.id), "File taken off.");
                  }}
                  aria-label={`Remove ${f.file_name}`}
                  className="rounded p-0.5 text-muted hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <AttachForm taskId={taskId} onAttached={reload} />
      </section>

      {/* ------------------------------------------------ comments */}
      <section className="flex flex-col gap-2" data-task-comments>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Comments{detail.comments.length ? ` · ${detail.comments.length}` : ""}</h4>
        {detail.comments.length === 0 && <p className="text-xs text-muted">No comments yet. Everyone on the task is told of a new one.</p>}
        <ul className="flex flex-col gap-2">
          {detail.comments.map((c) => (
            <li key={c.id} className="rounded-md bg-bg px-3 py-2" data-task-comment>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-ink">{nameOf(c.author_id)}</span>
                <span className="flex items-center gap-1 text-muted">
                  {when(c.created_at)}
                  {c.author_id === me && (
                    <button type="button" onClick={() => run(`comment-${c.id}`, () => deleteTaskComment(c.id))} aria-label="Delete this comment" className="rounded p-0.5 hover:text-danger">
                      <Trash2 aria-hidden className="h-3 w-3" />
                    </button>
                  )}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{c.body}</p>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run("comment", () => addTaskComment(taskId, comment), "Comment posted.")) setComment("");
          }}
        >
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={COMMENT_MAX} placeholder="Write an update or a question…" aria-label="Write a comment" />
          <Button type="submit" size="sm" variant="outline-primary" pending={busy === "comment"} disabled={!comment.trim()} className="self-end" data-post-comment>
            Post comment
          </Button>
        </form>
      </section>

      {/* ------------------------------------------------ edit, delete */}
      {(detail.can.edit || detail.can.delete) && (
        <section className="flex flex-col gap-2 border-t border-border pt-4">
          {editing ? (
            <EditForm
              detail={detail}
              revalidateTo={pathname}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                toast("Task saved.");
                void reload();
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {detail.can.edit && (
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} data-edit-task-open>
                  <Pencil aria-hidden className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {detail.can.delete && (
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  pending={busy === "delete"}
                  onClick={async () => {
                    const others = detail.copies.filter((c) => c.ownerId !== me).length;
                    const sure = confirm(others ? `Delete this task for everyone on it (${detail.copies.length} people)? It can be restored from the audit log.` : "Delete this task? It can be restored from the audit log.");
                    if (sure && (await run("delete", () => deleteTask(t.id, pathname), "Task deleted."))) onDeleted();
                  }}
                  data-delete-task
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  Delete task
                </Button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
