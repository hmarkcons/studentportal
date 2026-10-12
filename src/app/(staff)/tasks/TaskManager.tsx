"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Columns3, List, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import { NewTaskButton } from "@/components/tasks/NewTaskButton";
import { TaskCardView, STATUS_TONE } from "@/components/tasks/TaskCard";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { setTaskStatus } from "@/lib/actions/staffTasks";
import {
  BUCKET_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  assignmentProgress,
  boardColumns,
  compareTasks,
  dueLabel,
  groupTasks,
  isOverdue,
  matchesQuery,
  taskBucket,
  type TaskBucket,
  type TaskStatus,
} from "@/lib/staffTasks";
import type { TaskCard, TaskPerson } from "@/lib/staffTasksLoad";
import { toast } from "@/lib/toast";

export type TasksTab = "mine" | "given" | "team";
export type TasksView = "list" | "board";

const TAB_LABELS: Record<TasksTab, string> = { mine: "My tasks", given: "Assigned by me", team: "Team" };

/** One task given out to several people: its first copy stands for it, and every copy says how its owner is doing. */
type Assignment = { taskId: string; lead: TaskCard; copies: TaskCard[]; status: TaskStatus; label: string };

function assignments(copies: readonly TaskCard[]): Assignment[] {
  const by = new Map<string, TaskCard[]>();
  for (const c of copies) by.set(c.taskId, [...(by.get(c.taskId) ?? []), c]);
  return [...by.values()].map((list) => {
    const sorted = [...list].sort(compareTasks);
    const p = assignmentProgress(list);
    return { taskId: list[0].taskId, lead: sorted[0], copies: list, status: p.status, label: p.label };
  });
}

export function TaskManager({
  tab,
  view,
  mine,
  given,
  team,
  people,
  me,
  today,
  openTask,
  canSeeTeam,
}: {
  tab: TasksTab;
  view: TasksView;
  mine: TaskCard[];
  given: TaskCard[];
  team: TaskCard[] | null;
  people: TaskPerson[];
  me: string;
  today: string;
  openTask: string | null;
  canSeeTeam: boolean;
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("");
  const [person, setPerson] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [open, setOpen] = useState<string | null>(openTask);
  // What has been moved or ticked here, shown before the server has said so.
  const [moved, setMoved] = useState<Record<string, TaskStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const nameMap = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people]);
  const nameOf = useCallback((id: string | null) => (!id ? "Someone" : (nameMap.get(id) ?? "A former colleague")), [nameMap]);
  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const href = (next: Partial<{ tab: TasksTab; view: TasksView }>) => {
    const p = new URLSearchParams();
    const t = next.tab ?? tab;
    const v = next.view ?? view;
    if (t !== "mine") p.set("tab", t);
    if (v !== "list") p.set("view", v);
    const qs = p.toString();
    return `/tasks${qs ? `?${qs}` : ""}`;
  };

  /** Opens a task's panel, and says so in the address so it can be shared or come back to. */
  const show = (id: string | null) => {
    setOpen(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("task", id);
    else url.searchParams.delete("task");
    window.history.replaceState(null, "", url.toString());
  };

  // A task given out, with everyone on it — the viewer's own copy too, when
  // they gave it to themselves as well — so "1 of 2 done" counts them all.
  const givenAll = useMemo(() => {
    const givenTasks = new Set(given.map((g) => g.taskId));
    return [...given, ...mine.filter((m) => givenTasks.has(m.taskId))];
  }, [given, mine]);
  const source = tab === "mine" ? mine : tab === "given" ? givenAll : (team ?? []);
  const withMoves = source.map((t) => (moved[t.id] ? { ...t, status: moved[t.id] } : t));
  const filtered = withMoves.filter(
    (t) =>
      (!priority || t.priority === priority) &&
      (!person || t.ownerId === person) &&
      matchesQuery(
        { title: t.title, description: t.description, studentName: t.studentName, people: [nameOf(t.ownerId), t.assignedBy ? nameOf(t.assignedBy) : null] },
        query,
      ),
  );

  const move = async (task: TaskCard, status: TaskStatus) => {
    if (task.status === status) return;
    setMoved((m) => ({ ...m, [task.id]: status }));
    setBusy(task.id);
    const result = await setTaskStatus(task.id, status, null);
    setBusy(null);
    if (result.error) {
      setMoved((m) => {
        const { [task.id]: _gone, ...rest } = m;
        return rest;
      });
      toast(result.error, "danger");
      return;
    }
    if (status === "done") toast("Marked done.");
    refresh();
  };

  const canMove = (t: TaskCard) => tab !== "given" && (t.ownerId === me || tab === "team");
  const openCount = (list: TaskCard[]) => list.filter((t) => t.status !== "done").length;
  const givenOpen = assignments(givenAll).filter((a) => a.status !== "done").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Whose tasks">
          {(["mine", "given", ...(canSeeTeam ? ["team"] : [])] as TasksTab[]).map((t) => (
            <Link
              key={t}
              prefetch={false}
              href={href({ tab: t })}
              role="tab"
              aria-selected={tab === t}
              data-tasks-tab={t}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-primary text-primary-ink" : "text-muted hover:bg-bg hover:text-ink"}`}
            >
              {TAB_LABELS[t]}
              {t === "mine" && openCount(mine) > 0 && <span className="ml-1.5 text-xs opacity-80">{openCount(mine)}</span>}
              {t === "given" && givenOpen > 0 && <span className="ml-1.5 text-xs opacity-80">{givenOpen}</span>}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-border" aria-label="View">
            <Link
              prefetch={false}
              href={href({ view: "list" })}
              aria-current={view === "list"}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs ${view === "list" ? "bg-bg font-medium text-ink" : "text-muted"}`}
              data-tasks-view="list"
            >
              <List aria-hidden className="h-3.5 w-3.5" />
              List
            </Link>
            <Link
              prefetch={false}
              href={href({ view: "board" })}
              aria-current={view === "board"}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs ${view === "board" ? "bg-bg font-medium text-ink" : "text-muted"}`}
              data-tasks-view="board"
            >
              <Columns3 aria-hidden className="h-3.5 w-3.5" />
              Board
            </Link>
          </div>
          <NewTaskButton people={people} me={me} today={today} revalidateTo="/tasks" onCreated={(id) => show(id)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, students, people…"
            aria-label="Search tasks"
            className="w-full rounded-md border border-border bg-card py-1.5 pl-7 pr-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
        {/* Sized by a box of their own: the Select fills whatever holds it. */}
        <div className="w-40">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            <option value="">Any priority</option>
            <option value="urgent">Urgent</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
        {tab !== "mine" && (
          <div className="w-48">
            <Select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" data-filter-person>
              <option value="">Everyone</option>
              {[...new Set(source.map((t) => t.ownerId))]
                .map((id) => ({ id, name: nameOf(id) }))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === me ? "Me" : p.name}
                  </option>
                ))}
            </Select>
          </div>
        )}
      </div>

      {tab === "given" ? (
        <GivenView
          items={assignments(filtered)}
          view={view}
          today={today}
          nameOf={nameOf}
          showDone={showDone}
          setShowDone={setShowDone}
          onOpen={(id) => show(id)}
        />
      ) : view === "board" ? (
        <Board
          tasks={filtered}
          today={today}
          nameOf={nameOf}
          me={me}
          showOwner={tab === "team"}
          busy={busy}
          canMove={canMove}
          onOpen={(id) => show(id)}
          onMove={move}
        />
      ) : (
        <ListView
          tasks={filtered}
          today={today}
          nameOf={nameOf}
          me={me}
          showOwner={tab === "team"}
          busy={busy}
          canMove={canMove}
          showDone={showDone}
          setShowDone={setShowDone}
          onOpen={(id) => show(id)}
          onMove={move}
          emptyText={tab === "team" ? "Nobody on the team has a task open." : "Nothing to do. Add one with New task — for yourself or a colleague."}
        />
      )}

      <TaskPanel copyId={open} onClose={() => show(null)} people={people} me={me} today={today} onChanged={refresh} />
    </div>
  );
}

function DoneToggle({ count, showDone, setShowDone }: { count: number; showDone: boolean; setShowDone: (v: boolean) => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => setShowDone(!showDone)}
      className="inline-flex items-center gap-1 self-start text-xs font-medium text-muted hover:text-ink"
      data-show-done
    >
      {showDone ? <ChevronDown aria-hidden className="h-3.5 w-3.5" /> : <ChevronRight aria-hidden className="h-3.5 w-3.5" />}
      Done in the last 30 days ({count})
    </button>
  );
}

function ListView({
  tasks,
  today,
  nameOf,
  me,
  showOwner,
  busy,
  canMove,
  showDone,
  setShowDone,
  onOpen,
  onMove,
  emptyText,
}: {
  tasks: TaskCard[];
  today: string;
  nameOf: (id: string | null) => string;
  me: string;
  showOwner: boolean;
  busy: string | null;
  canMove: (t: TaskCard) => boolean;
  showDone: boolean;
  setShowDone: (v: boolean) => void;
  onOpen: (id: string) => void;
  onMove: (t: TaskCard, s: TaskStatus) => void;
  emptyText: string;
}) {
  const groups = groupTasks(tasks, today);
  const open = groups.filter((g) => g.bucket !== "done");
  const done = groups.find((g) => g.bucket === "done");
  return (
    <div className="flex flex-col gap-5" data-tasks-list>
      {open.length === 0 && <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{emptyText}</p>}
      {open.map((g) => (
        <section key={g.bucket} className="flex flex-col gap-2" data-task-group={g.bucket}>
          <h3 className={`text-xs font-semibold uppercase tracking-wide ${g.bucket === "overdue" ? "text-danger" : "text-muted"}`}>
            {g.label} <span className="font-normal">· {g.tasks.length}</span>
          </h3>
          {g.tasks.map((t) => (
            <TaskCardView
              key={t.id}
              task={t}
              today={today}
              nameOf={nameOf}
              me={me}
              showOwner={showOwner}
              showStatus
              busy={busy === t.id}
              onOpen={() => onOpen(t.id)}
              onToggle={canMove(t) ? () => onMove(t, t.status === "done" ? "pending" : "done") : undefined}
            />
          ))}
        </section>
      ))}
      {done && <DoneToggle count={done.tasks.length} showDone={showDone} setShowDone={setShowDone} />}
      {done && showDone && (
        <section className="flex flex-col gap-2" data-task-group="done">
          {done.tasks.map((t) => (
            <TaskCardView
              key={t.id}
              task={t}
              today={today}
              nameOf={nameOf}
              me={me}
              showOwner={showOwner}
              busy={busy === t.id}
              onOpen={() => onOpen(t.id)}
              onToggle={canMove(t) ? () => onMove(t, "pending") : undefined}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function Board({
  tasks,
  today,
  nameOf,
  me,
  showOwner,
  busy,
  canMove,
  onOpen,
  onMove,
}: {
  tasks: TaskCard[];
  today: string;
  nameOf: (id: string | null) => string;
  me: string;
  showOwner: boolean;
  busy: string | null;
  canMove: (t: TaskCard) => boolean;
  onOpen: (id: string) => void;
  onMove: (t: TaskCard, s: TaskStatus) => void;
}) {
  const cols = boardColumns(tasks);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3" data-tasks-board>
      {TASK_STATUSES.map((s) => (
        <section
          key={s}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(s);
          }}
          onDragLeave={() => setOver((o) => (o === s ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const task = byId.get(e.dataTransfer.getData("text/task"));
            if (task && canMove(task)) onMove(task, s);
          }}
          className={`flex min-h-[12rem] flex-col gap-2 rounded-lg border p-2 transition-colors ${over === s ? "border-primary bg-primary/5" : "border-border bg-bg/40"}`}
          data-board-column={s}
          aria-label={TASK_STATUS_LABELS[s]}
        >
          <h3 className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <span>{TASK_STATUS_LABELS[s]}</span>
            <Badge tone={STATUS_TONE[s]}>{cols[s].length}</Badge>
          </h3>
          {cols[s].length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">Drop a task here</p>}
          {cols[s].map((t) => (
            <div key={t.id} className="flex flex-col gap-1">
              <TaskCardView
                task={t}
                today={today}
                nameOf={nameOf}
                me={me}
                showOwner={showOwner}
                busy={busy === t.id}
                draggable={canMove(t)}
                onOpen={() => onOpen(t.id)}
              />
              {/* For a keyboard, and a phone, which cannot drag: the stage as a choice. */}
              {canMove(t) && (
                <select
                  value={t.status}
                  onChange={(e) => onMove(t, e.target.value as TaskStatus)}
                  aria-label={`Stage of ${t.title}`}
                  className="self-end rounded border border-transparent bg-transparent px-1 text-[11px] text-muted hover:border-border focus:border-border"
                  data-move-task={t.id}
                >
                  {TASK_STATUSES.map((x) => (
                    <option key={x} value={x}>
                      {TASK_STATUS_LABELS[x]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** Tasks given out: one row per task, with how each person on it is doing. */
function GivenView({
  items,
  view,
  today,
  nameOf,
  showDone,
  setShowDone,
  onOpen,
}: {
  items: Assignment[];
  view: TasksView;
  today: string;
  nameOf: (id: string | null) => string;
  showDone: boolean;
  setShowDone: (v: boolean) => void;
  onOpen: (copyId: string) => void;
}) {
  if (view === "board") {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3" data-tasks-board>
        {TASK_STATUSES.map((s) => {
          const list = items.filter((a) => a.status === s).sort((a, b) => compareTasks(a.lead, b.lead));
          return (
            <section key={s} className="flex min-h-[12rem] flex-col gap-2 rounded-lg border border-border bg-bg/40 p-2" data-board-column={s}>
              <h3 className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                <span>{TASK_STATUS_LABELS[s]}</span>
                <Badge tone={STATUS_TONE[s]}>{list.length}</Badge>
              </h3>
              {list.map((a) => (
                <AssignmentCard key={a.taskId} a={a} today={today} nameOf={nameOf} onOpen={onOpen} />
              ))}
            </section>
          );
        })}
      </div>
    );
  }
  const open = items.filter((a) => a.status !== "done");
  const done = items.filter((a) => a.status === "done");
  const buckets = new Map<TaskBucket, Assignment[]>();
  for (const a of open) {
    const b = taskBucket({ status: "pending", due_date: a.lead.due_date }, today);
    buckets.set(b, [...(buckets.get(b) ?? []), a]);
  }
  const order: TaskBucket[] = ["overdue", "today", "tomorrow", "week", "later"];
  return (
    <div className="flex flex-col gap-5" data-tasks-list>
      {open.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          Nothing given out is still open. Give a colleague a task with New task, and follow it here.
        </p>
      )}
      {order
        .filter((b) => buckets.has(b))
        .map((b) => (
          <section key={b} className="flex flex-col gap-2" data-task-group={b}>
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${b === "overdue" ? "text-danger" : "text-muted"}`}>
              {BUCKET_LABELS[b]} <span className="font-normal">· {buckets.get(b)!.length}</span>
            </h3>
            {buckets
              .get(b)!
              .sort((x, y) => compareTasks(x.lead, y.lead))
              .map((a) => (
                <AssignmentCard key={a.taskId} a={a} today={today} nameOf={nameOf} onOpen={onOpen} />
              ))}
          </section>
        ))}
      <DoneToggle count={done.length} showDone={showDone} setShowDone={setShowDone} />
      {showDone && done.map((a) => <AssignmentCard key={a.taskId} a={a} today={today} nameOf={nameOf} onOpen={onOpen} />)}
    </div>
  );
}

function AssignmentCard({
  a,
  today,
  nameOf,
  onOpen,
}: {
  a: Assignment;
  today: string;
  nameOf: (id: string | null) => string;
  onOpen: (copyId: string) => void;
}) {
  const late = a.copies.some((c) => isOverdue(c, today));
  return (
    <button
      type="button"
      onClick={() => onOpen(a.lead.id)}
      className={`flex flex-col gap-1.5 rounded-md border bg-card px-3 py-2 text-left hover:shadow-sm ${late ? "border-danger/50" : "border-border"}`}
      data-assignment={a.taskId}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-sm font-medium ${a.status === "done" ? "text-muted line-through" : "text-ink"}`}>{a.lead.title}</span>
        <Badge tone={STATUS_TONE[a.status]}>{a.label}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        <span className={late ? "font-medium text-danger" : ""}>{dueLabel(a.lead.due_date, a.lead.due_time, today, a.status)}</span>
        {a.lead.studentName && <span className="text-info">{a.lead.studentName}</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {a.copies.map((c) => (
          <span
            key={c.id}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
              c.status === "done" ? "bg-success-bg text-success" : c.status === "in_progress" ? "bg-warning-bg text-warning" : "bg-bg text-muted"
            }`}
            title={TASK_STATUS_LABELS[c.status]}
            data-assignee-status={c.status}
          >
            <UserRound aria-hidden className="h-3 w-3" />
            {nameOf(c.ownerId)}
          </span>
        ))}
      </div>
    </button>
  );
}
