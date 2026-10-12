"use client";

import { CheckSquare, MessageSquare, Paperclip, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { dueLabel, isOverdue, PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/staffTasks";
import type { TaskCard as Card } from "@/lib/staffTasksLoad";

export const STATUS_TONE: Record<TaskStatus, "neutral" | "warning" | "success"> = { pending: "neutral", in_progress: "warning", done: "success" };

/** The tick on a card: done, or back to To do. A task under way is left under way until it is done. */
export function TaskTick({ status, onToggle, disabled, label }: { status: TaskStatus; onToggle: () => void; disabled?: boolean; label: string }) {
  const done = status === "done";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      aria-pressed={done}
      aria-label={done ? `Mark "${label}" not done` : `Mark "${label}" done`}
      title={done ? "Mark not done" : "Mark done"}
      data-task-tick
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
        done ? "border-success bg-success text-white" : status === "in_progress" ? "border-warning bg-warning-bg" : "border-border hover:border-primary"
      }`}
    >
      {done && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
          <path d="M2.5 6.5l2.2 2L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/**
 * One task on a list or a board: its tick, its title and how urgent, when it
 * is due, who it is about, who gave it (or whose it is), and how far along.
 */
export function TaskCardView({
  task,
  today,
  nameOf,
  me,
  onOpen,
  onToggle,
  showOwner = false,
  showStatus = false,
  draggable = false,
  busy = false,
}: {
  task: Card;
  today: string;
  nameOf: (id: string | null) => string;
  me: string;
  onOpen: () => void;
  onToggle?: () => void;
  /** Say whose copy it is — on someone else's list, or everyone's. */
  showOwner?: boolean;
  /** Say its stage — on the list; the board's columns say it already. */
  showStatus?: boolean;
  draggable?: boolean;
  busy?: boolean;
}) {
  const overdue = isOverdue(task, today);
  const done = task.status === "done";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      draggable={draggable}
      onDragStart={draggable ? (e) => e.dataTransfer.setData("text/task", task.id) : undefined}
      data-task-card={task.id}
      data-task-status={task.status}
      className={`group flex cursor-pointer items-start gap-2 rounded-md border bg-card px-3 py-2 text-left transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        overdue ? "border-danger/50" : "border-border"
      } ${busy ? "opacity-60" : ""}`}
    >
      {onToggle && <TaskTick status={task.status} onToggle={onToggle} disabled={busy} label={task.title} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium ${done ? "text-muted line-through" : "text-ink"}`}>{task.title}</p>
          <div className="flex shrink-0 items-center gap-1">
            {showStatus && task.status !== "pending" && <Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>}
            {task.priority !== "medium" && <Badge tone={task.priority === "urgent" ? "danger" : "neutral"}>{PRIORITY_LABELS[task.priority]}</Badge>}
          </div>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className={overdue ? "font-medium text-danger" : ""}>{dueLabel(task.due_date, task.due_time, today, task.status)}</span>
          {task.studentName && <span className="truncate text-info">{task.studentName}</span>}
          {showOwner && (
            <span className="inline-flex items-center gap-0.5">
              <UserRound aria-hidden className="h-3 w-3" />
              {task.ownerId === me ? "Me" : nameOf(task.ownerId)}
            </span>
          )}
          {task.assignedBy && task.ownerId === me && <span>from {nameOf(task.assignedBy)}</span>}
          {task.steps.total > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Checklist">
              <CheckSquare aria-hidden className="h-3 w-3" />
              {task.steps.done}/{task.steps.total}
            </span>
          )}
          {task.comments > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Comments">
              <MessageSquare aria-hidden className="h-3 w-3" />
              {task.comments}
            </span>
          )}
          {task.files > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Files">
              <Paperclip aria-hidden className="h-3 w-3" />
              {task.files}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
