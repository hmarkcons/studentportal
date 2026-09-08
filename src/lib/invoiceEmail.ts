// The invoice email a student receives. Deliberately carries no PDF
// attachment — the receipt is reached through a button that opens it in the
// browser, where it can be printed or saved.
//
// One typography-led design, three tones. A receipt, a bill and a reminder are
// the same figures in different weather, so they share a layout and differ
// only in the hero line, the accent colour, and whether the bank block appears
// at all. Tables and inline styles throughout, because that is all email
// clients can be relied on to render — no flexbox, no stylesheet, no webfont.

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
  /**
   * Same invoice, three framings: the original bill, a reminder once an
   * installment is past due, and an acknowledgement once money has arrived.
   */
  variant?: "invoice" | "overdue" | "receipt";
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

/** Bare figure, for columns where the currency is stated once at the top. */
function amount(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const INK = "#14151a";
const BODY = "#5f6068";
const FAINT = "#9b9ca3";
const HAIR = "#ebebe8";
const PAGE = "#f6f6f4";
const GREEN = "#157a5b";
const AMBER = "#a05a20";

// A system stack, not a webfont: Gmail and Outlook strip @font-face, so a
// hosted face would silently fall back on most clients anyway.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Tabular figures, so the amount column lines up without a monospace face.
const NUM = `${FONT};font-variant-numeric:tabular-nums;font-feature-settings:'tnum'`;

export function buildInvoiceEmail(data: InvoiceEmailData) {
  const { math } = data;
  const overdue = data.variant === "overdue";
  const receipt = data.variant === "receipt";
  const settled = receipt && data.balanceDue <= 0;

  const accent = receipt ? GREEN : overdue ? AMBER : INK;

  const subject = receipt
    ? `Receipt for invoice ${data.invoiceNumber} — ${money(data.currency, data.amountPaid)} received`
    : overdue
      ? `Payment overdue — Invoice ${data.invoiceNumber} — ${money(data.currency, data.balanceDue)} outstanding`
      : `Invoice ${data.invoiceNumber} from HMARK Consultants — ${money(data.currency, data.balanceDue)} due`;

  // The one figure the reader opened the mail for.
  const heroLabel = receipt ? "Payment received" : overdue ? "Payment overdue" : "Amount due";
  const heroValue = receipt ? data.amountPaid : data.balanceDue;

  const preheader = receipt
    ? settled
      ? `Thank you — nothing further is outstanding on ${data.invoiceNumber}.`
      : `${money(data.currency, data.balanceDue)} still outstanding on ${data.invoiceNumber}.`
    : overdue
      ? `${money(data.currency, data.balanceDue)} is past its due date.`
      : `Your invoice from HMARK Consultants${data.intake ? ` for the ${data.intake} intake` : ""}.`;

  // A receipt for a settled invoice should not also tell the student where to
  // send money. It still does when something is left to pay, since a part
  // payment is acknowledged and chased in the same breath.
  const showBank = Boolean(data.bank) && !settled;

  const breakdown: [string, string][] = [["Consultancy fee", amount(math.consultancyFee)]];
  if (math.discountAmount > 0) {
    breakdown.push([`Discount${data.discountReason ? ` · ${data.discountReason}` : ""}`, `− ${amount(math.discountAmount)}`]);
  }
  if (math.taxAmount > 0) breakdown.push([`SRB tax · ${math.taxRate}%`, amount(math.taxAmount)]);
  if (math.adminCharge > 0) breakdown.push(["Administrative charge", amount(math.adminCharge)]);

  // Installment 1 carries the whole administrative charge — see
  // buildInstallmentPlan. Unexplained, a bigger first payment reads as an error.
  const adminNote = (no: number) => (no === 1 && math.adminCharge > 0 ? " · includes the administrative charge" : "");

  // ---- plain text (what a text-only client, and most spam filters, see) ----
  const text = [
    `Dear ${data.studentName},`,
    ``,
    receipt
      ? `Thank you — we have received ${money(data.currency, data.amountPaid)} against invoice ${data.invoiceNumber}.${settled ? " Nothing further is outstanding." : ` ${money(data.currency, data.balanceDue)} remains outstanding.`}`
      : overdue
        ? `One or more installments on invoice ${data.invoiceNumber} are now past their due date. Please arrange payment at your earliest convenience.`
        : `Please find your invoice ${data.invoiceNumber} from HMARK Consultants${data.destination ? ` for ${data.destination}` : ""}${data.intake ? ` (${data.intake} intake)` : ""}.`,
    ``,
    `${heroLabel.toUpperCase()}: ${money(data.currency, heroValue)}`,
    ``,
    ...breakdown.map(([l, v]) => `  ${l}: ${v}`),
    `  Total: ${amount(math.total)}`,
    data.amountPaid > 0 ? `  Received: − ${amount(data.amountPaid)}` : "",
    `  Balance: ${amount(data.balanceDue)}`,
    `  (all amounts in ${data.currency})`,
    ``,
    data.installments.length > 1 ? `Payment schedule:` : "",
    ...data.installments.map(
      (i) => `  ${i.no}. ${money(data.currency, i.amount)} — ${i.paid ? "paid" : `due ${fmtDate(i.dueDate)}`}${adminNote(i.no)}`
    ),
    ``,
    `View your receipt: ${data.receiptUrl}`,
    `(Opens in your browser, where you can print or save it.)`,
    ``,
    ...(showBank && data.bank
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

  // ---- HTML ----
  const line = (label: string, value: string, opts: { strong?: boolean; color?: string; rule?: boolean } = {}) => {
    const pad = opts.rule ? "11px 0 0" : "5px 0";
    const border = opts.rule ? `border-top:1px solid ${HAIR};` : "";
    const weight = opts.strong ? "600 " : "";
    return `
    <tr>
      <td style="padding:${pad};${border}font:${weight}13px ${FONT};color:${opts.color ?? (opts.strong ? INK : BODY)}">${esc(label)}</td>
      <td style="padding:${pad};${border}text-align:right;white-space:nowrap;font:${weight}13px ${NUM};color:${opts.color ?? INK}">${esc(value)}</td>
    </tr>`;
  };

  const scheduleHtml =
    data.installments.length > 1
      ? `
        <tr><td style="padding:26px 0 0">
          <div style="font:600 10px ${FONT};letter-spacing:.10em;text-transform:uppercase;color:${FAINT};padding-bottom:9px">Payment schedule</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            ${data.installments
              .map(
                (i) => `<tr>
                  <td style="padding:8px 0;border-bottom:1px solid ${HAIR};font:13px ${FONT};color:${INK}">
                    ${i.no}.&nbsp;<span style="font:13px ${NUM}">${esc(amount(i.amount))}</span>${
                      i.no === 1 && math.adminCharge > 0 ? `<span style="color:${FAINT}"> · incl. admin charge</span>` : ""
                    }
                  </td>
                  <td style="padding:8px 0;border-bottom:1px solid ${HAIR};text-align:right;white-space:nowrap;font:13px ${FONT};color:${i.paid ? GREEN : FAINT}">
                    ${i.paid ? "Paid" : `Due ${esc(fmtDate(i.dueDate))}`}
                  </td>
                </tr>`
              )
              .join("")}
          </table>
        </td></tr>`
      : "";

  const bankHtml =
    showBank && data.bank
      ? `
        <tr><td style="padding:26px 0 0">
          <div style="font:600 10px ${FONT};letter-spacing:.10em;text-transform:uppercase;color:${FAINT};padding-bottom:9px">Where to pay</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${PAGE};border-radius:10px">
            <tr><td style="padding:16px 18px;font:13px ${FONT};color:${BODY};line-height:1.85">
              ${data.bank.accountTitle ? `<span style="color:${INK}">${esc(data.bank.accountTitle)}</span><br>` : ""}
              ${data.bank.bankName ? `${esc(data.bank.bankName)}${data.bank.branch ? `, ${esc(data.bank.branch)}` : ""}<br>` : ""}
              ${data.bank.accountNumber ? `Account <span style="font:13px ${NUM};color:${INK}">${esc(data.bank.accountNumber)}</span><br>` : ""}
              ${data.bank.iban ? `IBAN <span style="font:13px ${NUM};color:${INK}">${esc(data.bank.iban)}</span><br>` : ""}
              ${data.bank.swiftCode ? `SWIFT <span style="font:13px ${NUM};color:${INK}">${esc(data.bank.swiftCode)}</span><br>` : ""}
              Reference <span style="font:13px ${NUM};color:${INK}">${esc(data.invoiceNumber)}</span>
              ${data.bank.paymentNote ? `<br><span style="color:${FAINT}">${esc(data.bank.paymentNote)}</span>` : ""}
            </td></tr>
          </table>
          ${data.conversionNote ? `<div style="padding:12px 2px 0;font:12px ${FONT};color:${FAINT};line-height:1.65">${esc(data.conversionNote)}</div>` : ""}
        </td></tr>`
      : "";

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-font-smoothing:antialiased">
<!-- Preview text: what the inbox list shows before the mail is opened. The
     run of spacers stops the client filling that line with the body's first
     words instead. -->
<div style="display:none;font-size:1px;color:${PAGE};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}&nbsp;&zwnj;${"&nbsp;&zwnj;".repeat(60)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${PAGE}">
  <tr><td align="center" style="padding:40px 16px">

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:496px;border-collapse:collapse">

      <!-- The only block of colour in the design, and the one thing that tells
           a receipt from a reminder before a word is read. -->
      <tr><td style="background:${accent};height:3px;line-height:3px;font-size:0">&nbsp;</td></tr>

      <tr><td style="background:#ffffff;padding:38px 36px 34px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">

          <tr><td style="font:600 10px ${FONT};letter-spacing:.16em;text-transform:uppercase;color:${FAINT}">HMARK Consultants</td></tr>

          <!-- Hero: label small and quiet, figure large. One number should
               answer the reason the mail was opened. -->
          <tr><td style="padding:30px 0 0;font:13px ${FONT};color:${BODY}">${esc(heroLabel)}</td></tr>
          <tr><td style="padding:5px 0 0;font:600 33px ${NUM};color:${accent};letter-spacing:-.6px;line-height:1.15">
            <span style="font:600 15px ${FONT};color:${FAINT};letter-spacing:.04em">${esc(data.currency)}</span>&nbsp;${esc(amount(heroValue))}
          </td></tr>
          <tr><td style="padding:11px 0 0;font:12px ${FONT};color:${FAINT}">
            Receipt ${esc(data.invoiceNumber)}${data.destination ? ` · ${esc(data.destination)}` : ""}${data.intake ? ` · ${esc(data.intake)} intake` : ""}
          </td></tr>

          <tr><td style="padding:26px 0 0;font:14px ${FONT};color:${BODY};line-height:1.7">
            ${
              receipt
                ? `Thank you, ${esc(data.studentName)} — your payment has been received${settled ? " and nothing further is outstanding" : ""}.`
                : overdue
                  ? `${esc(data.studentName)}, one or more installments on this invoice are now past their due date.`
                  : `${esc(data.studentName)}, here is your invoice from HMARK Consultants.`
            }
          </td></tr>

          <tr><td style="padding:26px 0 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
              ${breakdown.map(([l, v]) => line(l, v)).join("")}
              ${line("Total", amount(math.total), { strong: true, rule: true })}
              ${data.amountPaid > 0 ? line("Received", `− ${amount(data.amountPaid)}`, { color: GREEN }) : ""}
              ${line("Balance", amount(data.balanceDue), { strong: true, color: data.balanceDue <= 0 ? GREEN : INK, rule: true })}
            </table>
            <div style="padding:9px 0 0;font:11px ${FONT};color:${FAINT}">All amounts in ${esc(data.currency)}.</div>
          </td></tr>

          ${scheduleHtml}

          <!-- No attachment by design: the receipt opens in the browser, where
               it can be printed or saved. -->
          <tr><td style="padding:30px 0 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
              <tr><td style="background:${INK};border-radius:8px">
                <a href="${esc(data.receiptUrl)}" target="_blank"
                   style="display:inline-block;padding:13px 26px;font:600 13px ${FONT};color:#ffffff;text-decoration:none">
                  View receipt&nbsp;&nbsp;&rarr;
                </a>
              </td></tr>
            </table>
            <div style="padding:10px 2px 0;font:11px ${FONT};color:${FAINT}">Opens in your browser — print or save it from there.</div>
          </td></tr>

          ${bankHtml}

          <tr><td style="padding:30px 0 0">
            <div style="border-top:1px solid ${HAIR};padding:18px 0 0;font:12px ${FONT};color:${FAINT};line-height:1.75">
              If anything here looks wrong, reply to this email and your counselor will check it.<br>
              This link is personal to you — please don&rsquo;t forward it.
            </div>
          </td></tr>

        </table>
      </td></tr>

      <tr><td align="center" style="padding:20px 0 0;font:11px ${FONT};color:${FAINT}">
        HMARK Consultants · Karachi, Pakistan
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, text, html };
}
