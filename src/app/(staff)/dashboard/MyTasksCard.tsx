import Link from "next/link";
import { ListTodo } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CompactTaskList } from "@/components/tasks/CompactTaskList";
import { assignmentProgress, taskCounts } from "@/lib/staffTasks";
import { loadGivenTasks, loadMyTasks, loadTaskPeople } from "@/lib/staffTasksLoad";
import { karachiToday } from "@/lib/calendarDates";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The viewer's to-do list on their dashboard, whatever their role: what is
 * overdue and due today first, ticked off in place, and how the tasks they
 * gave colleagues are getting on.
 */
export async function MyTasksCard({ supabase, me }: { supabase: SupabaseClient; me: string }) {
  const today = karachiToday();
  const [people, mine, given] = await Promise.all([loadTaskPeople(supabase), loadMyTasks(supabase, me, today), loadGivenTasks(supabase, me, today)]);
  const counts = taskCounts(mine, today);
  const byTask = new Map<string, { status: string | null }[]>();
  for (const c of given) byTask.set(c.taskId, [...(byTask.get(c.taskId) ?? []), c]);
  const givenOpen = [...byTask.values()].filter((copies) => assignmentProgress(copies).status !== "done").length;
  const givenLate = given.filter((c) => c.status !== "done" && c.due_date < today).length;

  return (
    <div data-my-tasks-card>
      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <ListTodo aria-hidden className="h-4 w-4 text-primary" />
            My tasks
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {counts.overdue > 0 && <Badge tone="danger">{counts.overdue} overdue</Badge>}
            <Badge tone={counts.today ? "warning" : "neutral"}>{counts.today} due today</Badge>
            {counts.inProgress > 0 && <Badge tone="info">{counts.inProgress} in progress</Badge>}
            <Badge tone="neutral">{counts.open} open</Badge>
          </div>
        </div>
        <CompactTaskList
          tasks={mine}
          people={people}
          me={me}
          today={today}
          revalidateTo="/dashboard"
          emptyText="Nothing on your list. Add a task for yourself or a colleague."
        />
        {givenOpen > 0 && (
          <p className="mt-3 border-t border-border pt-2 text-xs text-muted">
            You have given {givenOpen} open {givenOpen === 1 ? "task" : "tasks"} to colleagues
            {givenLate > 0 && <span className="font-medium text-danger"> · {givenLate} overdue</span>} —{" "}
            <Link prefetch={false} href="/tasks?tab=given" className="font-medium text-primary hover:underline">
              follow them
            </Link>
            .
          </p>
        )}
      </Card>
    </div>
  );
}
