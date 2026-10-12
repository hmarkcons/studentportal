import { PageGuard } from "@/components/PageGuard";

// Who may open /tasks — src/lib/pageAccess.ts (page.tasks, 0331).
export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/tasks">{children}</PageGuard>;
}
