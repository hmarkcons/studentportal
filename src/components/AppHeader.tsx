import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/students/actions";

export async function AppHeader({ active }: { active: "students" | "board" }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: staffRow } = await supabase
    .from("staff")
    .select("full_name, role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const linkClass = (name: "students" | "board") =>
    `text-sm font-medium ${
      active === name
        ? "text-zinc-900 dark:text-zinc-50"
        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
    }`;

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-8">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Case Flow</h1>
          {staffRow ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {staffRow.full_name} &middot; {staffRow.role === "admin" ? "Admin" : "Counselor"}
            </p>
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              No staff profile for {user?.email}
            </p>
          )}
        </div>
        <nav className="flex gap-6">
          <Link href="/students" className={linkClass("students")}>
            Students
          </Link>
          <Link href="/board" className={linkClass("board")}>
            Board
          </Link>
        </nav>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
