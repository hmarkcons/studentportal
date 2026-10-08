import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { isUndeliverableAddress } from "@/lib/emailRecipients";
import { buildInvite, inviteActions, inviteEmail, inviteSignature, inviteWhen, type InviteEvent } from "@/lib/icsInvite";
import { deliversEmail } from "@/lib/notificationDelivery";
import { karachiToday } from "@/lib/calendarDates";

// The guests of a calendar item hear about it: an invitation the moment they
// are added, with a calendar file that puts it in their own calendar; an
// update when its time, place or words change; a cancellation when they are
// taken off it or it is deleted. What each guest was last sent is kept in
// calendar_invites (0324), which is what makes the next email an update of
// the same event rather than a second one.
//
// Run after the save has answered (next/server's after()), so adding a guest
// never makes the person wait for a mail server.

type Table = "personal_tasks" | "application_tasks";

type Row = {
  id: string;
  owner_id: string | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  due_date: string | null;
  end_date: string | null;
  due_time: string | null;
  end_time?: string | null;
  all_day: boolean | null;
  recurrence: string | null;
  recurrence_end_date: string | null;
  location?: string | null;
  notify_minutes?: number | null;
  guest_emails: string[] | null;
};

type SentRow = {
  email: string;
  sequence: number;
  signature: string;
  event: InviteEvent;
  cancelled: boolean;
  organizer_name: string | null;
  status: "sent" | "skipped" | "failed";
};

const COLUMNS: Record<Table, string> = {
  personal_tasks:
    "id, owner_id, title, description, due_date, end_date, due_time, end_time, all_day, recurrence, recurrence_end_date, location, notify_minutes, guest_emails",
  application_tasks:
    "id, owner_id, description, notes, due_date, end_date, due_time, end_time, all_day, recurrence, recurrence_end_date, location, notify_minutes, guest_emails",
};

function inviteEventOf(table: Table, row: Row): InviteEvent | null {
  if (!row.due_date) return null;
  const timed = row.all_day !== true && Boolean(row.due_time);
  return {
    title: (table === "personal_tasks" ? row.title : row.description)?.trim() || "Calendar event",
    description: (table === "personal_tasks" ? row.description : row.notes)?.trim() || null,
    location: row.location?.trim() || null,
    date: row.due_date,
    endDate: row.end_date && row.end_date > row.due_date ? row.end_date : null,
    time: timed ? row.due_time!.slice(0, 5) : null,
    endTime: timed && row.end_time ? row.end_time.slice(0, 5) : null,
    recurrence: row.recurrence && row.recurrence !== "none" ? row.recurrence : null,
    recurrenceEndDate: row.recurrence && row.recurrence !== "none" ? row.recurrence_end_date : null,
    alarmMinutes: row.notify_minutes ?? null,
  };
}

/** The address a From header names: "HMARK <info@x.com>" → info@x.com. */
function addressOf(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

/** The calendar's own name for this item, the same in every email about it. */
function uidOf(table: Table, id: string): string {
  return `${table === "personal_tasks" ? "personal" : "task"}-${id}@hmarkconsultants.com`;
}

async function organizerOf(admin: ReturnType<typeof createAdminClient>, ownerId: string | null) {
  const office = addressOf(process.env.SMTP_FROM || process.env.SMTP_USER || "");
  if (!ownerId) return { name: "HMARK Consultants", email: office, replyTo: undefined as string | undefined };
  const { data: staff } = await admin.from("staff").select("full_name, email_official").eq("id", ownerId).maybeSingle();
  let email = (staff?.email_official as string | null)?.trim() || null;
  if (!email) {
    const { data } = await admin.auth.admin.getUserById(ownerId);
    email = data?.user?.email ?? null;
  }
  const name = (staff?.full_name as string | null)?.trim() || "HMARK Consultants";
  return { name, email: email || office, replyTo: email ?? undefined };
}

/**
 * Brings every guest of one calendar item up to date with it. Called after
 * it is added, edited, moved or deleted; a save that changed nothing a guest
 * sees sends nothing.
 */
export async function syncGuestInvites(table: Table, id: string): Promise<{ sent: number; skipped: number; failed: number }> {
  const tally = { sent: 0, skipped: 0, failed: 0 };
  if (!isEmailConfigured()) return tally;
  const admin = createAdminClient();

  const [{ data: rowData }, { data: sentData }] = await Promise.all([
    admin.from(table).select(COLUMNS[table]).eq("id", id).maybeSingle(),
    admin
      .from("calendar_invites")
      .select("email, sequence, signature, event, cancelled, organizer_name, status")
      .eq("source_table", table)
      .eq("source_id", id),
  ]);
  const row = (rowData as unknown as Row | null) ?? null;
  const sent = (sentData ?? []) as SentRow[];
  const event = row ? inviteEventOf(table, row) : null;
  const deleted = !row || !event;
  if (deleted && sent.every((s) => s.cancelled)) return tally;

  const guests = row?.guest_emails ?? [];
  const signature = event ? inviteSignature(event) : "";
  // A send that failed is owed again: as though it had never gone, but
  // numbered after it, so the guest's calendar takes the newest.
  const delivered = sent.filter((s) => s.status !== "failed");
  const owed = inviteActions(guests, delivered, signature, deleted);
  const failedCancels = deleted ? [] : sent.filter((s) => s.status === "failed" && s.cancelled && !guests.some((g) => g.toLowerCase() === s.email.toLowerCase()));
  const invite = owed.invite;
  const update = owed.update;
  const cancel = [...owed.cancel, ...failedCancels.map((s) => s.email.toLowerCase())];
  if (invite.length + update.length + cancel.length === 0) return tally;

  const organizer = await organizerOf(admin, row?.owner_id ?? null);
  const office = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  const from = `"${organizer.name.replace(/"/g, "")} (HMARK)" <${addressOf(office)}>`;
  const known = new Map(sent.map((s) => [s.email.toLowerCase(), s]));
  const now = new Date();

  const deliver = async (email: string, kind: "invite" | "update" | "cancel") => {
    const before = known.get(email);
    const version = kind === "cancel" ? before!.event : event!;
    const sequence = before ? before.sequence + 1 : 0;
    const method = kind === "cancel" ? "CANCEL" : "REQUEST";
    const attendees = kind === "cancel" ? [email] : [...new Set(guests.map((g) => g.toLowerCase()))];
    const ics = buildInvite({
      uid: uidOf(table, id),
      sequence,
      method,
      event: version,
      organizer: { name: before?.organizer_name && kind === "cancel" ? before.organizer_name : organizer.name, email: organizer.email },
      attendees,
      now,
    });
    const words = inviteEmail({ kind, event: version, organizerName: organizer.name, when: inviteWhen(version) });

    let status: "sent" | "skipped" | "failed" = "sent";
    let error: string | null = null;
    if (isUndeliverableAddress(email)) {
      status = "skipped";
    } else {
      const result = await sendEmail({
        to: email,
        subject: words.subject,
        text: words.text,
        html: words.html,
        from,
        replyTo: organizer.replyTo,
        icalEvent: { method, content: ics },
      });
      if ("error" in result && result.error) {
        status = "failed";
        error = result.error;
      }
    }
    tally[status]++;
    await admin.from("calendar_invites").upsert(
      {
        source_table: table,
        source_id: id,
        email,
        sequence,
        signature: kind === "cancel" ? before!.signature : signature,
        event: version,
        organizer_name: organizer.name,
        status,
        error,
        cancelled: kind === "cancel",
        sent_at: now.toISOString(),
      },
      { onConflict: "source_table,source_id,email" }
    );
  };

  for (const email of invite) await deliver(email, "invite");
  for (const email of update) await deliver(email, "update");
  for (const email of cancel) await deliver(email, "cancel");
  return tally;
}

/**
 * Every upcoming calendar item with guests, brought up to date: run by the
 * ten-minute cron, so a guest added before invitations existed, or one whose
 * invitation failed to send, still hears of it. Each item is a no-op once its
 * guests have what they are owed. Only from a deployment, as every alert.
 */
export async function reconcileGuestInvites(limit = 40): Promise<{ checked: number; sent: number; failed: number }> {
  const out = { checked: 0, sent: 0, failed: 0 };
  if (!isEmailConfigured() || !deliversEmail()) return out;
  const admin = createAdminClient();
  const today = karachiToday();
  const stillAhead = `due_date.gte.${today},recurrence.neq.none`;
  const [{ data: personal }, { data: tasks }] = await Promise.all([
    admin.from("personal_tasks").select("id, recurrence_end_date").eq("status", "pending").not("guest_emails", "is", null).neq("guest_emails", "{}").or(stillAhead).limit(200),
    admin.from("application_tasks").select("id, recurrence_end_date").eq("status", "pending").not("guest_emails", "is", null).neq("guest_emails", "{}").or(stillAhead).limit(200),
  ]);
  const live = (rows: { id: string; recurrence_end_date: string | null }[] | null) =>
    (rows ?? []).filter((r) => !r.recurrence_end_date || r.recurrence_end_date >= today).map((r) => r.id);
  const items: [Table, string][] = [
    ...live(personal as never).map((id) => ["personal_tasks", id] as [Table, string]),
    ...live(tasks as never).map((id) => ["application_tasks", id] as [Table, string]),
  ];
  for (const [table, id] of items) {
    if (out.sent + out.failed >= limit) break;
    out.checked++;
    try {
      const t = await syncGuestInvites(table, id);
      out.sent += t.sent;
      out.failed += t.failed;
    } catch (err) {
      console.error(`[calendarInvites] reconcile ${table} ${id}:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/** After the save has answered: the guests of this item are brought up to date. */
export function syncGuestInvitesAfter(table: Table, id: string) {
  after(async () => {
    try {
      await syncGuestInvites(table, id);
    } catch (err) {
      console.error(`[calendarInvites] ${table} ${id}:`, err instanceof Error ? err.message : err);
    }
  });
}
