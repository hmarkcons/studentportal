"use server";

import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { normalizeRemark, remarkChanged, remarkError } from "@/lib/leadRemarks";

export type RemarkVersion = { id: string; body: string; createdAt: string; writtenBy: string | null };

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * Every version of a lead's remark, newest first, with who wrote each.
 *
 * Read through the viewer's own session: lead_remarks lets through whoever
 * can open the lead (staff_can_view_student), and nobody else.
 */
export async function listLeadRemarks(leadId: string): Promise<{ versions: RemarkVersion[] } | { error: string }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };
  const { data, error } = await supabase
    .from("lead_remarks")
    .select("id, body, created_at, author:staff!lead_remarks_written_by_fkey(full_name)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) return { error: error.message };
  return {
    versions: (data ?? []).map((v) => ({
      id: v.id as string,
      body: v.body as string,
      createdAt: v.created_at as string,
      writtenBy: (one(v.author as never) as { full_name?: string } | null)?.full_name ?? null,
    })),
  };
}

/**
 * Saves a lead's remark as a new version (0306) — the old one is kept — and
 * returns it. Empty clears the remark, as a version of its own. The same words
 * again change nothing and write nothing.
 */
export async function saveLeadRemark(
  leadId: string,
  raw: string
): Promise<{ success: true; remark: string | null; version: RemarkVersion | null } | { error: string }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };
  const invalid = remarkError(raw);
  if (invalid) return { error: invalid };
  const body = normalizeRemark(raw);

  const [{ data: lead }, { data: current }] = await Promise.all([
    supabase.from("leads").select("id").eq("id", leadId).maybeSingle(),
    supabase.from("lead_remark_current").select("body").eq("lead_id", leadId).maybeSingle(),
  ]);
  if (!lead) return { error: "That lead is not one you can open." };
  if (!remarkChanged((current?.body as string | null) ?? null, body)) return { success: true, remark: body || null, version: null };

  const { data: saved, error } = await supabase
    .from("lead_remarks")
    .insert({ lead_id: leadId, body, written_by: staff.id })
    .select("id, body, created_at")
    .single();
  if (error || !saved) return { error: error?.message ?? "The remark was not saved." };

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return {
    success: true,
    remark: body || null,
    version: { id: saved.id as string, body: saved.body as string, createdAt: saved.created_at as string, writtenBy: staff.full_name ?? null },
  };
}
