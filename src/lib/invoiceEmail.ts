// The invoice email a student receives. Deliberately carries no PDF
// attachment — the receipt is reached through a button that opens it in the
// browser, where it can be printed or saved.

import type { InvoiceMath } from "@/lib/invoiceMath";

export type InvoiceEmailData = {
  studentName: string;
  invoiceNumber: string;
  currency: string;
  intake: string | null;
  destination: string | null;
  discountReason: string | null;
  math: InvoiceMath;
  installments: { no: number; amount: number; dueDate: string | null; paid: boolean }[];
  amountPaid: number;
  balanceDue: number;
  receiptUrl: string;
  /** Set when the invoice currency differs from the account currency. */
  conversionNote?: string | null;
  bank: {
    bankName: string | null;
    accountTitle: string | null;
    accountNumber: string | null;
    iban: string | null;
    branch: string | null;
    swiftCode: string | null;
    paymentNote: string | null;
  } | null;
};

function money(currency: string, n: number) {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Escape anything that reaches the HTML body — names and reasons are free text. */
function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const INK = "#1c1b22";
const SOFT = "#6b6a76";
const LINE = "#e5e3ea";
const BRAND = "#52be96";

export function buildInvoiceEmail(data: InvoiceEmailData) {
  const { math } = data;
  const subject = `Invoice ${data.invoiceNumber} from HMARK Consultants — ${money(data.currency, data.balanceDue)} due`;

  const totalsRows: [string, string][] = [["Consultancy fee", money(data.currency, math.consultancyFee)]];
  if (math.discountAmount > 0) {
    totalsRows.push([
      `Discount${data.discountReason ? ` (${data.discountReason})` : ""}`,
      `− ${money(data.currency, math.discountAmount)}`,
    ]);
  }
  if (math.taxAmount > 0) totalsRows.push([`SRB tax (${math.taxRate}%)`, money(data.currency, math.taxAmount)]);
  if (math.adminCharge > 0) totalsRows.push(["Administrative charge", money(data.currency, math.adminCharge)]);

  // ---- plain text (what a text-only client, and most spam filters, see) ----
  const text = [
    `Dear ${data.studentName},`,
    ``,
    `Please find your invoice ${data.invoiceNumber} from HMARK Consultants${data.destination ? ` for ${data.destination}` : ""}${data.intake ? ` (${data.intake} intake)` : ""}.`,
    ``,
    ...totalsRows.map(([l, v]) => `  ${l}: ${v}`),
    `  Total: ${money(data.currency, math.total)}`,
    data.amountPaid > 0 ? `  Already paid: ${money(data.currency, data.amountPaid)}` : "",
    `  Balance due: ${money(data.currency, data.balanceDue)}`,
    ``,
    data.installments.length > 1 ? `Installments:` : "",
    ...data.installments.map((i) => `  ${i.no}. ${money(data.currency, i.amount)} — due ${fmtDate(i.dueDate)}${i.paid ? " (paid)" : ""}`),
    ``,
    `View your receipt: ${data.receiptUrl}`,
    `(Opens in your browser, where you can print or save it.)`,
    ``,
    ...(data.bank
      ? [
          `Payment details:`,
          data.bank.accountTitle ? `  Account title: ${data.bank.accountTitle}` : "",
          data.bank.bankName ? `  Bank: ${data.bank.bankName}${data.bank.branch ? `, ${data.bank.branch}` : ""}` : "",
          data.bank.accountNumber ? `  Account no.: ${data.bank.accountNumber}` : "",
          data.bank.iban ? `  IBAN: ${data.bank.iban}` : "",
          data.bank.swiftCode ? `  SWIFT: ${data.bank.swiftCode}` : "",
          `  Payment reference: ${data.invoiceNumber}`,
          data.bank.paymentNote ? `  ${data.bank.paymentNote}` : "",
          data.conversionNote ? `  ${data.conversionNote}` : "",
        ]
      : []),
    ``,
    `If anything here looks wrong, reply to this email and your counselor will check it.`,
    ``,
    `HMARK Consultants`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  // ---- HTML: tables and inline styles, since email clients strip much else ----
  const totalsHtml = totalsRows
    .map(
      ([l, v]) => `<tr>
        <td style="padding:6px 0;color:${SOFT};font-size:14px">${esc(l)}</td>
        <td style="padding:6px 0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:${INK}">${esc(v)}</td>
      </tr>`
    )
    .join("");

  const installmentsHtml =
    data.installments.length > 1
      ? `<h3 style="margin:24px 0 8px;font-size:14px;color:${INK}">Installments</h3>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
           ${data.installments
             .map(
               (i) => `<tr>
                 <td style="padding:6px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK}">${i.no}. ${esc(money(data.currency, i.amount))}</td>
                 <td style="padding:6px 0;border-bottom:1px solid ${LINE};text-align:right;font-size:13px;color:${i.paid ? BRAND : SOFT}">${i.paid ? "Paid" : `Due ${esc(fmtDate(i.dueDate))}`}</td>
               </tr>`
             )
             .join("")}
         </table>`
      : "";

  const bankHtml = data.bank
    ? `<h3 style="margin:24px 0 8px;font-size:14px;color:${INK}">Where to pay</h3>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f7f7f9;border:1px solid ${LINE};border-radius:8px">
         <tr><td style="padding:14px 16px;font-size:13px;color:${INK};line-height:1.7">
           ${data.bank.accountTitle ? `${esc(data.bank.accountTitle)}<br>` : ""}
           ${data.bank.bankName ? `${esc(data.bank.bankName)}${data.bank.branch ? `, ${esc(data.bank.branch)}` : ""}<br>` : ""}
           ${data.bank.accountNumber ? `Account no. <strong>${esc(data.bank.accountNumber)}</strong><br>` : ""}
           ${data.bank.iban ? `IBAN <strong>${esc(data.bank.iban)}</strong><br>` : ""}
           ${data.bank.swiftCode ? `SWIFT ${esc(data.bank.swiftCode)}<br>` : ""}
           Payment reference <strong>${esc(data.invoiceNumber)}</strong>
           ${data.bank.paymentNote ? `<br><span style="color:${SOFT}">${esc(data.bank.paymentNote)}</span>` : ""}
           ${data.conversionNote ? `<br><br><span style="color:${SOFT}">${esc(data.conversionNote)}</span>` : ""}
         </td></tr>
       </table>`
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f7f7f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${INK}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;border-collapse:collapse">
        <tr><td style="padding:28px 28px 0">
          <p style="margin:0 0 4px;font-size:13px;color:${SOFT}">HMARK Consultants</p>
          <h1 style="margin:0 0 4px;font-size:19px;color:${INK}">Invoice ${esc(data.invoiceNumber)}</h1>
          <p style="margin:0;font-size:13px;color:${SOFT}">
            ${esc(data.destination ?? "")}${data.destination && data.intake ? " · " : ""}${data.intake ? `${esc(data.intake)} intake` : ""}
          </p>
        </td></tr>

        <tr><td style="padding:20px 28px 0">
          <p style="margin:0 0 16px;font-size:15px;color:${INK}">Dear ${esc(data.studentName)},</p>
          <p style="margin:0 0 20px;font-size:14px;color:${SOFT};line-height:1.6">
            Here is your invoice from HMARK Consultants. You can open the full receipt below to print or save it.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            ${totalsHtml}
            <tr>
              <td style="padding:10px 0 0;border-top:1px solid ${LINE};font-size:15px;font-weight:600;color:${INK}">Total</td>
              <td style="padding:10px 0 0;border-top:1px solid ${LINE};text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:600;color:${INK}">${esc(money(data.currency, math.total))}</td>
            </tr>
            ${
              data.amountPaid > 0
                ? `<tr><td style="padding:6px 0;color:${SOFT};font-size:14px">Already paid</td>
                   <td style="padding:6px 0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:${BRAND}">− ${esc(money(data.currency, data.amountPaid))}</td></tr>`
                : ""
            }
            <tr>
              <td style="padding:6px 0;font-size:15px;font-weight:600;color:${INK}">Balance due</td>
              <td style="padding:6px 0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:600;color:${INK}">${esc(money(data.currency, data.balanceDue))}</td>
            </tr>
          </table>

          ${installmentsHtml}
        </td></tr>

        <tr><td style="padding:24px 28px 0" align="center">
          <a href="${esc(data.receiptUrl)}" target="_blank"
             style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:8px">
            View receipt
          </a>
          <p style="margin:10px 0 0;font-size:12px;color:${SOFT}">Opens in your browser — print or save it from there.</p>
        </td></tr>

        <tr><td style="padding:0 28px">${bankHtml}</td></tr>

        <tr><td style="padding:22px 28px 28px">
          <p style="margin:0;font-size:12px;color:${SOFT};line-height:1.6">
            If anything here looks wrong, reply to this email and your counselor will check it.<br>
            This link is personal to you — please don't forward it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
