import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { karachiToday } from "@/lib/calendarDates";
import { loadGivenTasks, loadMyTasks, loadTaskPeople, loadTeamTasks } from "@/lib/staffTasksLoad";
import { TaskManager, type TasksTab, type TasksView } from "./TaskManager";

/**
 * The task manager (0331): one's own to-do list, the tasks one has given
 * colleagues and how each of them is getting on, and — for Management and
 * Super Admin — everyone's. A list by when things are due, or a board by
 * stage; each task opens on its checklist, comments and files.
 */
export default async function TasksPage(props: PageProps<"/tasks">) {
  const params = await props.searchParams;
  const { supabase, staff } = await getStaffSession();
  if (!staff) return null;
  const canSeeTeam = hasRole(staff, "management", "super_admin");
  const tabParam = typeof params.tab === "string" ? params.tab : "";
  const tab: TasksTab = tabParam === "given" ? "given" : tabParam === "team" && canSeeTeam ? "team" : "mine";
  const view: TasksView = params.view === "board" ? "board" : "list";
  const openTask = typeof params.task === "string" && /^[0-9a-f-]{36}$/i.test(params.task) ? params.task : null;
  const today = karachiToday();

  const [people, mine, given, team] = await Promise.all([
    loadTaskPeople(supabase),
    loadMyTasks(supabase, staff.id, today),
    loadGivenTasks(supabase, staff.id, today),
    tab === "team" ? loadTeamTasks(supabase, today) : Promise.resolve(null),
  ]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Tasks</h1>
        <p className="text-sm text-muted">Your to-do list, and the tasks you give colleagues. Each is on its owner&rsquo;s calendar too.</p>
      </div>
      <TaskManager tab={tab} view={view} mine={mine} given={given} team={team} people={people} me={staff.id} today={today} openTask={openTask} canSeeTeam={canSeeTeam} />
    </div>
  );
}
