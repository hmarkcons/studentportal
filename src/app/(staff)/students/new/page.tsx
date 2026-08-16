import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { NewStudentForm } from "./NewStudentForm";

export default async function NewStudentPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, full_name, role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const isAdmin = staffRow?.role === "admin";

  const { data: allStaff } = isAdmin
    ? await supabase.from("staff").select("id, full_name, role").order("full_name")
    : { data: [] };

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <AppHeader active="students" />
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-xl">
          <h2 className="mb-6 text-base font-medium text-zinc-900 dark:text-zinc-50">New case</h2>
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <NewStudentForm
              counselors={allStaff ?? []}
              lockedToSelf={isAdmin || !staffRow ? null : staffRow}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
