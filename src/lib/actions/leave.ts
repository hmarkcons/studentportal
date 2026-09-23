"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { staffRoles } from "@/lib/auth/roles";
import { validateDocumentFile, sanitizeFilename } from "@/lib/documentUpload";
import { officeToday } from "@/lib/attendance";
import {
  LEAVE_KIND_LABEL,
  leaveYear,
  paidDaysUsed,
  shortNotice,
  splitLeave,
  workingDates,
  type LeaveKind,
} from "@/lib/leave";
import { holdsPermission } from "@/lib/permissionResolve";
import { formatLeaveRange, leaveHtml, leaveSubject, leaveText, type LeaveMail } from "@/lib/leaveEmail";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";

// Staff leave (0272). A staff member asks; someone holding leave.approve —
// Management and Super Admin by default — decides, never on their own
// request; on approval the exact dates are fixed as paid or unpaid, and
// payroll reads those. The tables' policies enforce the same rules again.

type Result = { error: string; success?: undefined } | { success: true; error?: undefined; message?: string };

const KINDS: LeaveKind[] = ["planned", "sick", "emergency"];
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function refresh() {
  for (const p of ["/my-leave", "/admin/leave", "/finance/payroll"]) revalidatePath(p);
}

async function mail(to: string | null | undefined, message: LeaveMail) {
  if (!to) return;
  await sendEmail({ to, subject: leaveSubject(message), text: leaveText(message), html: leaveHtml(message) });
}

// ------------------------------------------------------------ the arithmetic

type Split = {
  dates: string[];
  paid: string[];
  unpaid: string[];
  reason: "certificate" | "allowance" | null;
  allowance: number;
  usedBefore: number;
  year: { start: string; end: string };
};

/**
 * How a request would split into paid and unpaid days, for one person, as
 * things stand now: their working days (their own, else the office's), the
 * holidays in the range, and what they have already taken this leave year.
 *
 * The one place this is worked out, so a preview, an approval and leave
 * recorded for someone all get the same answer.
 */
async function computeSplit(input: {
  staffId: string;
  start: string;
  end: string;
  kind: LeaveKind;
  hasCertificate: boolean;
  excludeRequestId?: string;
}): Promise<Split | { error: string }> {
  const admin = createAdminClient();
  const [{ data: staff }, { data: policy }, { data: holidays }] = await Promise.all([
    admin.from("staff").select("joined_on, created_at, work_days").eq("id", input.staffId).maybeSingle(),
    admin.from("attendance_policy").select("work_days, annual_leave_days").maybeSingle(),
    admin.from("office_holidays").select("holiday_date").gte("holiday_date", input.start).lte("holiday_date", input.end),
  ]);
  if (!staff) return { error: "That staff member no longer exists." };

  const workDays = staff.work_days?.length ? staff.work_days : (policy?.work_days ?? [1, 2, 3, 4, 5, 6]);
  const dates = workingDates(input.start, input.end, workDays, new Set((holidays ?? []).map((h) => h.holiday_date)));
  if (dates.length === 0) return { error: "Those dates are all days off or holidays — there's nothing to take leave from." };

  const joined = staff.joined_on ?? String(staff.created_at).slice(0, 10);
  const year = leaveYear(joined, input.start);
  let query = admin
    .from("leave_requests")
    .select("id, paid_dates")
    .eq("staff_id", input.staffId)
    .eq("status", "approved")
    .lte("start_date", year.end)
    .gte("end_date", year.start);
  if (input.excludeRequestId) query = query.neq("id", input.excludeRequestId);
  const { data: approved } = await query;

  const allowance = policy?.annual_leave_days ?? 14;
  const usedBefore = paidDaysUsed(approved ?? [], year);
  const split = splitLeave({ dates, kind: input.kind, hasCertificate: input.hasCertificate, remaining: allowance - usedBefore });
  return { dates, ...split, allowance, usedBefore, year };
}

/** A staff member's paid leave this leave year. */
async function balanceFor(staffId: string, onDate = officeToday()) {
  const admin = createAdminClient();
  const [{ data: staff }, { data: policy }] = await Promise.all([
    admin.from("staff").select("joined_on, created_at").eq("id", staffId).maybeSingle(),
    admin.from("attendance_policy").select("annual_leave_days").maybeSingle(),
  ]);
  const joined = staff?.joined_on ?? String(staff?.created_at ?? onDate).slice(0, 10);
  const year = leaveYear(joined, onDate);
  const { data: approved } = await admin
    .from("leave_requests")
    .select("paid_dates")
    .eq("staff_id", staffId)
    .eq("status", "approved")
    .lte("start_date", year.end)
    .gte("end_date", year.start);
  const allowance = policy?.annual_leave_days ?? 14;
  const used = paidDaysUsed(approved ?? [], year);
  return { year, allowance, used, remaining: Math.max(0, allowance - used), joinedOn: staff?.joined_on ?? null };
}

// ------------------------------------------------------------ who approves

/** Every active staff member holding leave.approve, bar the one it is about. */
async function approversFor(staffId: string) {
  const admin = createAdminClient();
  const [{ data: staff }, { data: definition }, { data: roleOverrides }, { data: staffOverrides }] = await Promise.all([
    admin.from("staff").select("id, full_name, email_official, role, roles").eq("status", "active"),
    admin.from("permission_definitions").select("key, default_roles").eq("key", "leave.approve").maybeSingle(),
    admin.from("role_permission_overrides").select("role, permission_key, allowed").eq("permission_key", "leave.approve"),
    admin.from("staff_permission_overrides").select("staff_id, permission_key, allowed").eq("permission_key", "leave.approve"),
  ]);
  const tables = { definition, roleOverrides: roleOverrides ?? [], staffOverrides: staffOverrides ?? [] };
  return (staff ?? []).filter(
    (s) => s.id !== staffId && holdsPermission({ id: s.id, roles: staffRoles(s) }, "leave.approve", tables)
  );
}

// ------------------------------------------------------------ their own

async function uploadCertificate(staffId: string, file: File | null): Promise<{ path: string | null } | { error: string }> {
  if (!file || file.size === 0) return { path: null };
  const invalid = validateDocumentFile(file, "certificate");
  if (invalid) return { error: invalid };
  const supabase = await createClient();
  const path = `leave-certificates/${staffId}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  return error ? { error: error.message } : { path };
}

function readRequest(formData: FormData): { kind: LeaveKind; start: string; end: string; reason: string | null } | { error: string } {
  const kind = String(formData.get("kind") ?? "") as LeaveKind;
  const start = String(formData.get("start_date") ?? "");
  const end = String(formData.get("end_date") ?? "") || start;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!KINDS.includes(kind)) return { error: "Choose planned, sick or emergency leave." };
  if (!isDay(start) || !isDay(end)) return { error: "Choose the first and last day of the leave." };
  if (end < start) return { error: "The last day can't be before the first." };
  return { kind, start, end, reason };
}

const overlapMessage = (message: string) =>
  /overlap/i.test(message) ? "Those dates overlap leave you've already asked for or been given." : message;

/** A staff member asks for leave. */
export async function requestMyLeave(_prev: unknown, formData: FormData): Promise<Result> {
  const { staff: me } = await getStaffSession();
  if (!me) return { error: "Sign in again." };
  const read = readRequest(formData);
  if ("error" in read) return read;

  const preview = await computeSplit({ staffId: me.id, ...read, hasCertificate: false });
  if ("error" in preview) return preview;

  const upload = await uploadCertificate(me.id, formData.get("certificate") as File | null);
  if ("error" in upload) return upload;

  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").insert({
    staff_id: me.id,
    kind: read.kind,
    start_date: read.start,
    end_date: read.end,
    reason: read.reason,
    certificate_path: upload.path,
    status: "pending",
    created_by: me.id,
  });
  if (error) return { error: overlapMessage(error.message) };

  const short = shortNotice(read.kind, officeToday(), read.start);
  for (const approver of await approversFor(me.id)) {
    await mail(approver.email_official, {
      kind: "requested",
      recipientName: approver.full_name,
      staffName: me.full_name,
      leaveLabel: LEAVE_KIND_LABEL[read.kind],
      dates: formatLeaveRange(read.start, read.end),
      days: preview.dates.length,
      url: `${getSiteUrl()}/admin/leave`,
      shortNotice: short,
    });
  }

  refresh();
  return {
    success: true,
    message: short
      ? "Requested — note that planned leave needs a month's notice, so it may not be approved."
      : "Requested — you'll be emailed when it's decided.",
  };
}

/** A staff member withdraws a request nobody has decided yet. */
export async function cancelMyLeave(requestId: string): Promise<Result> {
  const { staff: me } = await getStaffSession();
  if (!me) return { error: "Sign in again." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("staff_id", me.id)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "It has already been decided, so it can't be withdrawn — ask HR." };
  refresh();
  return { success: true };
}

// ------------------------------------------------------------ deciding

/** Approves or rejects someone else's request. */
export async function decideLeave(requestId: string, decision: "approve" | "reject", note: string): Promise<Result> {
  const denied = await requirePermission("leave.approve", "You can't approve leave.");
  if (denied) return denied;
  const { staff: me } = await getStaffSession();

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("leave_requests")
    .select("id, staff_id, kind, start_date, end_date, certificate_path, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { error: "That request no longer exists." };
  if (request.status !== "pending") return { error: "It has already been decided or withdrawn." };
  if (request.staff_id === me?.id) return { error: "Someone else has to decide your own leave." };

  const admin = createAdminClient();
  const { data: member } = await admin.from("staff").select("full_name, email_official").eq("id", request.staff_id).maybeSingle();
  const dates = formatLeaveRange(request.start_date, request.end_date);
  const label = LEAVE_KIND_LABEL[request.kind as LeaveKind];

  if (decision === "reject") {
    if (!note.trim()) return { error: "Say why — they'll see this note." };
    const { data, error } = await supabase
      .from("leave_requests")
      .update({ status: "rejected", decision_note: note.trim(), decided_by: me?.id ?? null, decided_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "It was decided by someone else in the meantime." };
    await mail(member?.email_official, {
      kind: "rejected",
      staffName: member?.full_name ?? "",
      leaveLabel: label,
      dates,
      note: note.trim(),
      url: `${getSiteUrl()}/my-leave`,
    });
    refresh();
    return { success: true };
  }

  const split = await computeSplit({
    staffId: request.staff_id,
    start: request.start_date,
    end: request.end_date,
    kind: request.kind as LeaveKind,
    hasCertificate: Boolean(request.certificate_path),
    excludeRequestId: request.id,
  });
  if ("error" in split) return split;

  const { data, error } = await supabase
    .from("leave_requests")
    .update({
      status: "approved",
      paid_dates: split.paid,
      unpaid_dates: split.unpaid,
      decision_note: note.trim() || null,
      decided_by: me?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "It was decided by someone else in the meantime." };

  await mail(member?.email_official, {
    kind: "approved",
    staffName: member?.full_name ?? "",
    leaveLabel: label,
    dates,
    paid: split.paid.length,
    unpaid: split.unpaid.length,
    unpaidReason: split.reason,
    remaining: Math.max(0, split.allowance - split.usedBefore - split.paid.length),
    url: `${getSiteUrl()}/my-leave`,
  });
  refresh();
  return {
    success: true,
    message: split.unpaid.length
      ? `Approved — ${split.paid.length} paid, ${split.unpaid.length} unpaid.`
      : `Approved — ${split.paid.length} paid.`,
  };
}

/** Records leave for someone else, already approved — they phoned in sick. */
export async function recordLeaveFor(_prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("leave.approve", "You can't record leave.");
  if (denied) return denied;
  const { staff: me } = await getStaffSession();

  const staffId = String(formData.get("staff_id") ?? "");
  if (!staffId) return { error: "Choose who the leave is for." };
  if (staffId === me?.id) return { error: "Someone else has to record your own leave." };
  const read = readRequest(formData);
  if ("error" in read) return read;

  const upload = await uploadCertificate(staffId, formData.get("certificate") as File | null);
  if ("error" in upload) return upload;
  const split = await computeSplit({ staffId, ...read, hasCertificate: Boolean(upload.path) });
  if ("error" in split) return split;

  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").insert({
    staff_id: staffId,
    kind: read.kind,
    start_date: read.start,
    end_date: read.end,
    reason: read.reason,
    certificate_path: upload.path,
    status: "approved",
    paid_dates: split.paid,
    unpaid_dates: split.unpaid,
    decided_by: me?.id ?? null,
    decided_at: new Date().toISOString(),
    created_by: me?.id ?? null,
  });
  if (error) return { error: /overlap/i.test(error.message) ? "Those dates overlap leave they already have." : error.message };

  const { data: member } = await createAdminClient().from("staff").select("full_name, email_official").eq("id", staffId).maybeSingle();
  await mail(member?.email_official, {
    kind: "recorded",
    staffName: member?.full_name ?? "",
    leaveLabel: LEAVE_KIND_LABEL[read.kind],
    dates: formatLeaveRange(read.start, read.end),
    paid: split.paid.length,
    unpaid: split.unpaid.length,
    recordedBy: me?.full_name ?? null,
    url: `${getSiteUrl()}/my-leave`,
  });
  refresh();
  return { success: true, message: `Recorded — ${split.paid.length} paid, ${split.unpaid.length} unpaid.` };
}

// ------------------------------------------------------------ holidays

export async function addOfficeHoliday(_prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("attendance.qr_admin", "Only Super Admin can set office holidays.");
  if (denied) return denied;
  const date = String(formData.get("holiday_date") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!isDay(date)) return { error: "Choose the date." };
  if (!name) return { error: "Name the holiday, e.g. Eid ul-Fitr." };
  const { staff: me } = await getStaffSession();
  const supabase = await createClient();
  const { error } = await supabase.from("office_holidays").insert({ holiday_date: date, name, created_by: me?.id ?? null });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "That date is already a holiday." : error.message };
  revalidatePath("/setup/attendance-policy");
  refresh();
  return { success: true };
}

export async function deleteOfficeHoliday(date: string): Promise<Result> {
  const denied = await requirePermission("attendance.qr_admin", "Only Super Admin can set office holidays.");
  if (denied) return denied;
  const supabase = await createClient();
  const { error } = await supabase.from("office_holidays").delete().eq("holiday_date", date);
  if (error) return { error: error.message };
  revalidatePath("/setup/attendance-policy");
  refresh();
  return { success: true };
}

// ------------------------------------------------------------ what pages read

export type LeaveRow = {
  id: string;
  staffId: string;
  staffName: string;
  kind: LeaveKind;
  start: string;
  end: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  paidDays: number;
  unpaidDays: number;
  decisionNote: string | null;
  certificateUrl: string | null;
  createdAt: string;
  recordedForThem: boolean;
};

type RequestRecord = {
  id: string;
  staff_id: string;
  kind: LeaveKind;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: LeaveRow["status"];
  paid_dates: string[];
  unpaid_dates: string[];
  decision_note: string | null;
  certificate_path: string | null;
  created_at: string;
  created_by: string | null;
  staff: { full_name: string } | { full_name: string }[] | null;
};

const REQUEST_COLUMNS =
  "id, staff_id, kind, start_date, end_date, reason, status, paid_dates, unpaid_dates, decision_note, certificate_path, created_at, created_by, staff:staff!leave_requests_staff_id_fkey(full_name)";

async function toRows(rows: RequestRecord[]): Promise<LeaveRow[]> {
  const supabase = await createClient();
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      staffId: r.staff_id,
      staffName: (Array.isArray(r.staff) ? r.staff[0] : r.staff)?.full_name ?? "",
      kind: r.kind,
      start: r.start_date,
      end: r.end_date,
      reason: r.reason,
      status: r.status,
      paidDays: r.paid_dates.length,
      unpaidDays: r.unpaid_dates.length,
      decisionNote: r.decision_note,
      certificateUrl: r.certificate_path
        ? ((await supabase.storage.from("documents").createSignedUrl(r.certificate_path, 3600)).data?.signedUrl ?? null)
        : null,
      createdAt: r.created_at,
      recordedForThem: Boolean(r.created_by && r.created_by !== r.staff_id),
    }))
  );
}

export async function loadMyLeave() {
  const { staff: me } = await getStaffSession();
  if (!me) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .select(REQUEST_COLUMNS)
    .eq("staff_id", me.id)
    .order("start_date", { ascending: false })
    .returns<RequestRecord[]>();
  return { balance: await balanceFor(me.id), requests: await toRows(data ?? []) };
}

export type PendingView = LeaveRow & {
  workingDays: number;
  wouldBePaid: number;
  wouldBeUnpaid: number;
  unpaidReason: "certificate" | "allowance" | null;
  remainingBefore: number;
  shortNotice: boolean;
};

export async function loadLeaveAdmin() {
  const denied = await requirePermission("leave.approve", "You can't approve leave.");
  if (denied) return null;
  const { staff: me } = await getStaffSession();
  const supabase = await createClient();
  const today = officeToday();

  const [{ data: pending }, { data: recent }, { data: staff }] = await Promise.all([
    supabase.from("leave_requests").select(REQUEST_COLUMNS).eq("status", "pending").order("start_date").returns<RequestRecord[]>(),
    supabase
      .from("leave_requests")
      .select(REQUEST_COLUMNS)
      .neq("status", "pending")
      .order("start_date", { ascending: false })
      .limit(60)
      .returns<RequestRecord[]>(),
    supabase.from("staff").select("id, full_name").eq("status", "active").order("full_name"),
  ]);

  // Each pending request previewed as it would be approved right now, so the
  // approver sees the paid/unpaid split before pressing the button.
  const pendingRows = await toRows(pending ?? []);
  const pendingViews: PendingView[] = await Promise.all(
    pendingRows.map(async (row, i) => {
      const record = (pending ?? [])[i];
      const split = await computeSplit({
        staffId: row.staffId,
        start: row.start,
        end: row.end,
        kind: row.kind,
        hasCertificate: Boolean(record.certificate_path),
        excludeRequestId: row.id,
      });
      const ok = !("error" in split);
      return {
        ...row,
        workingDays: ok ? split.dates.length : 0,
        wouldBePaid: ok ? split.paid.length : 0,
        wouldBeUnpaid: ok ? split.unpaid.length : 0,
        unpaidReason: ok ? split.reason : null,
        remainingBefore: ok ? split.allowance - split.usedBefore : 0,
        shortNotice: shortNotice(row.kind, record.created_at.slice(0, 10), row.start),
      };
    })
  );

  const balances = await Promise.all(
    (staff ?? []).map(async (s) => ({ staffId: s.id, name: s.full_name, ...(await balanceFor(s.id, today)) }))
  );

  return {
    meId: me?.id ?? null,
    pending: pendingViews,
    recent: await toRows(recent ?? []),
    balances,
    staffOptions: (staff ?? []).filter((s) => s.id !== me?.id),
  };
}
