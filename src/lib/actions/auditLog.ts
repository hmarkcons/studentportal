"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { restoreTrashedFiles, stringsIn } from "@/lib/fileTrash";
import { idsIn } from "@/lib/auditLabels";
import { actorLabel, nameActors, nameIds } from "@/lib/auditNames";

// The audit log's way back (0322): open an event to see the record before,
// after and as it is now; revert an edit, restore a deletion, take back an
// addition. Super Admin only — the database functions check it as well, so
// this check is for a clear answer, not the protection.

type Row = Record<string, unknown>;

export type AuditEvent = {
  id: string;
  actor_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  row_key: Row | null;
  before: Row | null;
  after: Row | null;
  changed: string[] | null;
  created_at: string;
  source_event: string | null;
  subject_type: string | null;
  subject_id: string | null;
  internal: boolean;
};

export type AuditEventDetail = {
  event: AuditEvent;
  actor: string;
  /** The record as it is in the portal now; null when it is not. */
  now: Row | null;
  /** For a deletion: everything else that went with it and comes back with it. */
  group: { id: string; entity_type: string; before: Row | null; internal: boolean }[];
  /** What later took this event back, or undid it. */
  followUps: { id: string; action_type: string; created_at: string; actor: string }[];
  /** Names for the ids in the record. */
  names: Record<string, string>;
};

const EVENT_COLUMNS =
  "id, actor_id, action_type, entity_type, entity_id, row_key, before, after, changed, created_at, source_event, subject_type, subject_id, internal";

type Supabase = Awaited<ReturnType<typeof getStaffSession>>["supabase"];
type Failed = { error: string };

async function superAdmin(): Promise<Failed | { supabase: Supabase }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff || !hasRole(staff, "super_admin")) return { error: "Only a Super Admin can do this from the audit log." };
  return { supabase };
}

export async function auditEventDetail(eventId: string): Promise<Failed | { detail: AuditEventDetail }> {
  const who = await superAdmin();
  if ("error" in who) return { error: who.error };
  const { supabase } = who;

  const [{ data: event, error }, { data: now }, { data: group }, { data: followUps }] = await Promise.all([
    supabase.from("audit_log").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle(),
    supabase.rpc("audit_current_row", { p_event: eventId }),
    supabase.rpc("audit_restore_group", { p_event: eventId }),
    supabase.from("audit_log").select("id, action_type, created_at, actor_id").eq("source_event", eventId).order("created_at"),
  ]);
  if (error) return { error: error.message };
  if (!event) return { error: "That event is not in the audit log." };
  const ev = event as unknown as AuditEvent;

  const others = ((group ?? []) as AuditEvent[]).filter((g) => g.id !== ev.id);
  const [actors, names] = await Promise.all([
    nameActors(supabase, [ev.actor_id, ...(followUps ?? []).map((f) => f.actor_id as string | null)]),
    nameIds(supabase, idsIn([ev.before, ev.after, (now as Row | null) ?? null])),
  ]);

  return {
    detail: {
      event: ev,
      actor: actorLabel(actors, ev.actor_id),
      now: (now as Row | null) ?? null,
      group: ev.action_type === "DELETE" ? others.map((g) => ({ id: g.id, entity_type: g.entity_type, before: g.before, internal: g.internal })) : [],
      followUps: (followUps ?? []).map((f) => ({
        id: f.id,
        action_type: f.action_type,
        created_at: f.created_at,
        actor: actorLabel(actors, f.actor_id),
      })),
      names: Object.fromEntries(names),
    },
  };
}

/** The portal's own caches that hold copies of these tables, cleared once they change underneath them. */
const CACHE_TAGS: Record<string, string> = {
  universities: "universities",
  programs: "universities",
  destinations: "destinations",
  agreement_templates: "agreement-templates",
  fee_products: "fee-products",
  staff: "staff-directory",
  login_screen: "login-screen",
  login_figures: "login-screen",
};

function refreshAfter(tables: string[]) {
  for (const tag of new Set(tables.map((t) => CACHE_TAGS[t]).filter(Boolean))) revalidateTag(tag, { expire: 0 });
  revalidatePath("/admin/audit-log");
}

export async function restoreAuditEvent(eventId: string): Promise<Failed | { restored: number; files: number }> {
  const who = await superAdmin();
  if ("error" in who) return { error: who.error };
  const { data, error } = await who.supabase.rpc("audit_restore", { p_event: eventId });
  if (error) return { error: error.message };
  const restored = ((data as { restored?: { table: string; row: Row }[] } | null)?.restored ?? []);
  // The files the restored rows name, put back from where deleted files are kept.
  const files = await restoreTrashedFiles(stringsIn(restored.map((r) => r.row)));
  refreshAfter(restored.map((r) => r.table));
  return { restored: restored.length, files };
}

export async function revertAuditEvent(eventId: string): Promise<Failed | { fields: number; files: number }> {
  const who = await superAdmin();
  if ("error" in who) return { error: who.error };
  const [{ data: ev }, { data, error }] = await Promise.all([
    who.supabase.from("audit_log").select("entity_type").eq("id", eventId).maybeSingle(),
    who.supabase.rpc("audit_revert", { p_event: eventId }),
  ]);
  if (error) return { error: error.message };
  const result = data as { reverted?: string[]; before?: Row } | null;
  const fields = result?.reverted ?? [];
  // A file the edit replaced comes back with the field that named it.
  const before = result?.before ?? {};
  const files = await restoreTrashedFiles(stringsIn(fields.map((k) => before[k])));
  refreshAfter(ev?.entity_type ? [ev.entity_type] : []);
  return { fields: fields.length, files };
}

export async function undoAuditInsert(eventId: string): Promise<Failed | { removed: true }> {
  const who = await superAdmin();
  if ("error" in who) return { error: who.error };
  const [{ data: ev }, { error }] = await Promise.all([
    who.supabase.from("audit_log").select("entity_type").eq("id", eventId).maybeSingle(),
    who.supabase.rpc("audit_undo_insert", { p_event: eventId }),
  ]);
  if (error) return { error: error.message };
  refreshAfter(ev?.entity_type ? [ev.entity_type] : []);
  return { removed: true };
}
