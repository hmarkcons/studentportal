"use client";

import { useState } from "react";
import { InvoiceCard } from "@/app/(staff)/students/[id]/InvoicePanel";
import { computeInvoiceStatus, type InvoiceStatus } from "@/lib/invoiceStatus";

type Row = {
  invoice: Parameters<typeof InvoiceCard>[0]["invoice"];
  installments: Parameters<typeof InvoiceCard>[0]["installments"];
  lineItems: Parameters<typeof InvoiceCard>[0]["lineItems"];
  studentId: string;
  studentName: string;
  registeredAt: string | null;
  pdfUrl?: string | null;
};

export function ConsultancyFeeList({ rows, feeProducts }: { rows: Row[]; feeProducts: Parameters<typeof InvoiceCard>[0]["feeProducts"] }) {
  const [nameInput, setNameInput] = useState("");
  const [statusInput, setStatusInput] = useState("all");
  const [appliedName, setAppliedName] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("all");

  function search() {
    setAppliedName(nameInput.trim().toLowerCase());
    setAppliedStatus(statusInput);
  }
  function clear() {
    setNameInput("");
    setStatusInput("all");
    setAppliedName("");
    setAppliedStatus("all");
  }

  const filtered = rows.filter((r) => {
    if (appliedName && !r.studentName.toLowerCase().includes(appliedName)) return false;
    if (appliedStatus !== "all") {
      const status: InvoiceStatus = computeInvoiceStatus(r.invoice.admin_fee_status ?? "unpaid", r.installments);
      if (status !== appliedStatus) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search student name…"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        />
        <select value={statusInput} onChange={(e) => setStatusInput(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1.5 text-sm">
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </select>
        <button onClick={search} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          Search
        </button>
        <button onClick={clear} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-ink">
          Clear
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((r) => (
          <div key={r.invoice.id}>
            <p className="mb-1 text-xs text-muted">
              Registered {r.registeredAt ? new Date(r.registeredAt).toLocaleDateString() : "—"}
            </p>
            <InvoiceCard
              invoice={r.invoice}
              installments={r.installments}
              lineItems={r.lineItems}
              feeProducts={feeProducts}
              studentId={r.studentId}
              studentName={r.studentName}
              pdfUrl={r.pdfUrl}
              revalidateTo="/finance/consultancy-fee"
            />
          </div>
        ))}
        {filtered.length === 0 && <p className="py-10 text-center text-sm text-muted">No consultancy fee records match this search.</p>}
      </div>
    </div>
  );
}
