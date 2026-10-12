"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskStatus } from "@/lib/actions/staffTasks";
import { compareTasks, isOpen, taskBucket, type TaskStatus } from "@/lib/staffTasks";
import type { TaskCard, TaskPerson } from "@/lib/staffTasksLoad";
import { toast } from "@/lib/toast";
import { NewTaskButton } from "./NewTaskButton";
import { TaskCardView } from "./TaskCard";
import { TaskPanel } from "./TaskPanel";
import type { PickedStudent } from "./StudentPicker";

const RANK = { overdue: 0, today: 1, tomorrow: 2, week: 3, later: 4, done: 5 } as const;

/**
 * A few open tasks, the most pressing first, each ticked off or opened in
 * place — for the dashboard, and for a student's or a lead's own page.
 */
export function CompactTaskList({
  tasks,
  people,
  me,
  today,
  revalidateTo,
  student = null,
  limit = 6,
  showOwner = false,
  emptyText,
  moreHref = "/tasks",
}: {
  tasks: TaskCard[];
  people: TaskPerson[];
  me: string;
  today: string;
  revalidateTo: string;
  /** The student or lead a new task here is about. */
  student?: PickedStudent | null;
  limit?: number;
  showOwner?: boolean;
  emptyText: string;
  moreHref?: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<string, TaskStatus>>({});
  const nameMap = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people]);
  const nameOf = useCallback((id: string | null) => (!id ? "Someone" : (nameMap.get(id) ?? "A former colleague")), [nameMap]);
  const refresh = useCallback(() => start(() => router.refresh()), [router]);

  const shown = tasks
    .map((t) => (moved[t.id] ? { ...t, status: moved[t.id] } : t))
    .filter((t) => isOpen(t.status) || moved[t.id] === "done")
    .sort((a, b) => RANK[taskBucket(a, today)] - RANK[taskBucket(b, today)] || compareTasks(a, b));
  const rest = Math.max(0, shown.length - limit);

  const toggle = async (t: TaskCard) => {
    const next: TaskStatus = t.status === "done" ? "pending" : "done";
    setMoved((m) => ({ ...m, [t.id]: next }));
    const result = await setTaskStatus(t.id, next, null);
    if (result.error) {
      setMoved((m) => {
        const { [t.id]: _gone, ...others } = m;
        return others;
      });
      toast(result.error, "danger");
      return;
    }
    if (next === "done") toast("Marked done.");
    refresh();
  };

  return (
    <div className="flex flex-col gap-2" data-compact-tasks>
      {shown.length === 0 && <p className="text-sm text-muted">{emptyText}</p>}
      {shown.slice(0, limit).map((t) => (
        <TaskCardView
          key={t.id}
          task={t}
          today={today}
          nameOf={nameOf}
          me={me}
          showOwner={showOwner}
          showStatus
          onOpen={() => setOpen(t.id)}
          onToggle={t.ownerId === me ? () => toggle(t) : undefined}
        />
      ))}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <NewTaskButton people={people} me={me} today={today} student={student} revalidateTo={revalidateTo} variant="outline-primary" />
        <Link prefetch={false} href={moreHref} className="text-xs font-medium text-primary hover:underline">
          {rest > 0 ? `${rest} more in Tasks →` : "Open Tasks →"}
        </Link>
      </div>
      <TaskPanel copyId={open} onClose={() => setOpen(null)} people={people} me={me} today={today} onChanged={refresh} />
    </div>
  );
}
