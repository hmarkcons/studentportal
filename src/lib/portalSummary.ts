// What a student needs to act on, gathered for the portal dashboard.
//
// Each section of the portal already computes its own signal — unread
// messages, a support reply, an appointment, an outstanding balance. The
// dashboard is where they belong together: landing on it should answer "is
// anything waiting on me" without opening six tabs.
//
// Every field is derived from the same helpers those sections use, so the
// dashboard cannot disagree with the page it links to.

import { countUnreadMessages } from "@/lib/unreadMessages";
import { loadTicketActivity, loadTicketReadMarkers, hasUnseenStaffReply } from "@/lib/supportSignals";
import { loadAppointments, daysUntil, type PortalAppointment } from "@/lib/portalAppointments";
import { computePaymentProgress } from "@/lib/invoiceMath";
import { profileChecklist, countMissing, passportStatus, type PassportStatus } from "@/lib/profileCompleteness";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PortalSummary = {
  unreadMessages: number;
  ticketsWithNewReply: number;
  documentsNeedingAttention: number;
  nextAppointment: PortalAppointment | null;
  /** Every appointment still to come, soonest first — the dashboard's timeline. */
  upcomingAppointments: PortalAppointment[];
  /** Days until nextAppointment; negative never appears, past ones are dropped. */
  daysToAppointment: number | null;
  money: {
    currency: string;
    outstanding: number;
    /** What has been paid, and the whole of what is owed, across every invoice. */
    paid: number;
    total: number;
    nextDueDate: string | null;
    overdue: boolean;
    /** Each instalment not yet paid in full, with its date where it has one. */
    unpaid: { dueDate: string | null; amount: number; installmentNo: number }[];
  } | null;
  /** Profile fields a visa application needs that are still blank. */
  profileMissing: number;
  /** How many fields that checklist has, so the dashboard can draw it. */
  profileTotal: number;
  passport: PassportStatus;
};

export async function loadPortalSummary(supabase: SupabaseClient, studentId: string): Promise<PortalSummary> {
  const today = new Date().toISOString().slice(0, 10);

  const [unreadMessages, documentsNeedingAttention, appointments, invoices, tickets, student, profile] = await Promise.all([
    countUnreadMessages(supabase, studentId, "student"),
    supabase
      .from("student_documents")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .in("status", ["missing", "rejected"])
      .then((r) => r.count ?? 0),
    loadAppointments(supabase, studentId),
    supabase
      .from("invoices")
      .select("id, currency")
      .eq("student_id", studentId),
    supabase.from("support_tickets").select("id").eq("student_id", studentId),
    supabase.from("students").select("contact_number, date_of_birth, address").eq("id", studentId).maybeSingle(),
    supabase
      .from("student_profiles")
      .select(
        "emergency_contact_name, emergency_contact_number, passport_number, passport_expiry, cnic, financial_sponsor_name, financial_sponsor_relation, financial_details"
      )
      .eq("student_id", studentId)
      .maybeSingle(),
  ]);

  // Same checklist the Profile page shows, so the dashboard count and that
  // page can never disagree about what is outstanding.
  const profileInput = { ...(student.data ?? {}), ...(profile.data ?? {}) };
  const checklist = profileChecklist(profileInput);
  const profileMissing = countMissing(checklist);
  const passport = passportStatus(profile.data?.passport_expiry ?? null);

  // Support: how many tickets carry a reply the student has not opened.
  const ticketIds = (tickets.data ?? []).map((t) => t.id);
  const [activity, markers] = await Promise.all([
    loadTicketActivity(supabase, ticketIds),
    loadTicketReadMarkers(supabase, ticketIds, "student"),
  ]);
  const ticketsWithNewReply = ticketIds.filter((id) => hasUnseenStaffReply(id, activity, markers)).length;

  // Only appointments still to come — a dashboard prompting a student towards
  // a date that has passed is worse than saying nothing.
  const upcoming = appointments.filter((a) => daysUntil(a.date) >= 0);
  const nextAppointment = upcoming[0] ?? null;

  // Money: the instalment rows are the schedule of record (see
  // computePaymentProgress), so the balance comes from them rather than from
  // the fee fields.
  let money: PortalSummary["money"] = null;
  const invoiceRows = invoices.data ?? [];
  if (invoiceRows.length > 0) {
    const invoiceIds = invoiceRows.map((i) => i.id);
    const { data: installments } = await supabase
      .from("invoice_installments")
      .select("invoice_id, installment_no, amount, amount_paid, status, due_date")
      .in("invoice_id", invoiceIds);

    let outstanding = 0;
    let paid = 0;
    let total = 0;
    let nextDueDate: string | null = null;
    let overdue = false;
    const unpaid: NonNullable<PortalSummary["money"]>["unpaid"] = [];

    for (const inv of invoiceRows) {
      const mine = (installments ?? []).filter((i) => i.invoice_id === inv.id);
      const progress = computePaymentProgress(mine);
      outstanding += progress.outstanding;
      paid += progress.paid;
      total += progress.total;
      for (const i of mine) {
        if (i.status === "paid") continue;
        unpaid.push({
          dueDate: i.due_date ?? null,
          amount: Math.round((Number(i.amount ?? 0) - Number(i.amount_paid ?? 0)) * 100) / 100,
          installmentNo: Number(i.installment_no ?? 0),
        });
      }
      if (progress.nextDueDate && (!nextDueDate || progress.nextDueDate < nextDueDate)) {
        nextDueDate = progress.nextDueDate;
      }
      if (mine.some((i) => i.status !== "paid" && i.due_date && i.due_date < today)) overdue = true;
    }

    money = {
      // Students are billed in one currency; the first invoice's is theirs.
      currency: invoiceRows[0].currency,
      outstanding: Math.round(outstanding * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      total: Math.round(total * 100) / 100,
      nextDueDate,
      overdue,
      unpaid,
    };
  }

  return {
    unreadMessages,
    ticketsWithNewReply,
    documentsNeedingAttention,
    nextAppointment,
    upcomingAppointments: upcoming,
    daysToAppointment: nextAppointment ? daysUntil(nextAppointment.date) : null,
    money,
    profileMissing,
    profileTotal: checklist.length,
    passport,
  };
}
