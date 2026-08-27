export type InvoiceStatus = "paid" | "pending" | "overdue";

export function computeInvoiceStatus(
  adminFeeStatus: string,
  installments: { status: string; due_date: string | null }[]
): InvoiceStatus {
  const today = new Date().toISOString().slice(0, 10);
  const allPaid = adminFeeStatus === "paid" && installments.every((i) => i.status === "paid");
  if (allPaid) return "paid";

  // Admin fee has no due date of its own, so only installments can push status to overdue.
  const overdue = installments.some((i) => i.status !== "paid" && i.due_date && i.due_date < today);
  return overdue ? "overdue" : "pending";
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: "Paid",
  pending: "Pending",
  overdue: "Overdue",
};
