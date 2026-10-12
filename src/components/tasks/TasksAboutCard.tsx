import { Card } from "@/components/ui/Card";
import { getStaffSession } from "@/lib/auth/session";
import { karachiToday } from "@/lib/calendarDates";
import { loadTaskPeople, loadTasksAbout } from "@/lib/staffTasksLoad";
import { CompactTaskList } from "./CompactTaskList";

/**
 * The team's tasks about one student or lead (0331) — whoever they are for —
 * with a New task already linked to them. Only those the viewer may see:
 * their own, the ones they gave, and everyone's for Management.
 */
export async function TasksAboutCard({ studentId, name, revalidateTo, className = "" }: { studentId: string; name: string; revalidateTo: string; className?: string }) {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return null;
  const today = karachiToday();
  const [people, tasks] = await Promise.all([loadTaskPeople(supabase), loadTasksAbout(supabase, studentId, today)]);
  return (
    <div data-tasks-about={studentId} className={className}>
      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Team tasks</h3>
        <CompactTaskList
          tasks={tasks}
          people={people}
          me={staff.id}
          today={today}
          revalidateTo={revalidateTo}
          student={{ id: studentId, label: name }}
          showOwner
          limit={8}
          emptyText={`No open tasks about ${name}. Give one to yourself or a colleague — it lands on their list and their calendar.`}
        />
      </Card>
    </div>
  );
}
