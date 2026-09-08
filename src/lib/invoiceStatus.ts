export type InvoiceStatus = "paid" | "pending" | "overdue";

/**
 * The installments are the whole schedule: the administrative charge is
 * collected with the first one (see buildInstallmentPlan), so there is no
 * separate admin-fee state to satisfy.
 *
 * This used to also require admin_fee_status === 'paid'. Once the charge moved
 * into installment 1 that flag stopped being written, and leaving the check in
 * would have meant no invoice could ever read as paid again.
 */
export function computeInvoiceStatus(
  installments: { status: string; due_date: string | null }[]
): InvoiceStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (installments.length > 0 && installments.every((i) => i.status === "paid")) return "paid";

  const overdue = installments.some((i) => i.status !== "paid" && i.due_date && i.due_date < today);
  return overdue ? "overdue" : "pending";
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: "Paid",
  pending: "Pending",
  overdue: "Overdue",
};
