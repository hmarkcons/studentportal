import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/constants";

export type StaffSession = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string | null;
  staff: { id: string; full_name: string; role: StaffRole; status: string } | null;
};

// React's cache() dedupes this per request: layout.tsx + page.tsx (+ nested
// tab pages) all call this, but auth.getUser() and the staff-role lookup —
// each a real network round trip — only ever run once per navigation.
export const getStaffSession = cache(async (): Promise<StaffSession> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, userId: null, staff: null };

  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, role, status")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, userId: user.id, staff: staff as StaffSession["staff"] };
});

export type StudentSession = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string | null;
};

export const getStudentUser = cache(async (): Promise<StudentSession> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
});
