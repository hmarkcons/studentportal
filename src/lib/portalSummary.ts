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
import type { SupabaseClient } from "@supabase/supabase-js";

export type PortalSummary = {
  unreadMessages: number;
  ticketsWithNewReply: number;
  documentsNeedingAttention: number;
  nextAppointment: PortalAppointment | null;
  /** Days until nextAppointment; negative never appears, past ones are dropped. */
  daysToAppointment: number | null;
  money: {
    currency: string;
    outstanding: number;
    nextDueDate: string | null;
    overdue: boolean;
  } | null;
};

export async function loadPortalSummary(supabase: SupabaseClient, studentId: string): Promise<PortalSummary> {
  const today = new Date().toISOString().slice(0, 10);

  const [unreadMessages, documentsNeedingAttention, appointments, invoices, tickets] = await Promise.all([
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
  ]);

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
      .select("invoice_id, amount, amount_paid, status, due_date")
      .in("invoice_id", invoiceIds);

    let outstanding = 0;
    let nextDueDate: string | null = null;
    let overdue = false;

    for (const inv of invoiceRows) {
      const mine = (installments ?? []).filter((i) => i.invoice_id === inv.id);
      const progress = computePaymentProgress(mine);
      outstanding += progress.outstanding;
      if (progress.nextDueDate && (!nextDueDate || progress.nextDueDate < nextDueDate)) {
        nextDueDate = progress.nextDueDate;
      }
      if (mine.some((i) => i.status !== "paid" && i.due_date && i.due_date < today)) overdue = true;
    }

    money = {
      // Students are billed in one currency; the first invoice's is theirs.
      currency: invoiceRows[0].currency,
      outstanding: Math.round(outstanding * 100) / 100,
      nextDueDate,
      overdue,
    };
  }

  return {
    unreadMessages,
    ticketsWithNewReply,
    documentsNeedingAttention,
    nextAppointment,
    daysToAppointment: nextAppointment ? daysUntil(nextAppointment.date) : null,
    money,
  };
}
