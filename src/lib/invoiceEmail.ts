// The invoice email a student receives. Deliberately carries no PDF
// attachment — the receipt is reached through a button that opens it in the
// browser, where it can be printed or saved.
//
// One typography-led design, three tones. A receipt, a bill and a reminder are
// the same figures in different weather, so they share a layout and differ
// only in the hero line, the accent colour, and whether the bank block appears
// at all. Tables and inline styles throughout, because that is all email
// clients can be relied on to render — no flexbox, no stylesheet, no webfont.

import { feeLineLabel, installmentNote, type AdminChargeLine, type InvoiceMath } from "@/lib/invoiceMath";
import { hasPaymentInstructions } from "@/lib/invoiceIssuer";
import {
  AMBER,
  AMBER_BG,
  AMBER_EDGE,
  BODY,
  DEFAULT_OFFICE,
  FAINT,
  FONT,
  GREEN,
  HAIR,
  INK,
  MINT,
  MINT_EDGE,
  NUM,
  button,
  callout,
  card,
  displayName,
  emailFrame,
  esc,
  heading,
  label,
  rows,
  type Images,
  type OfficeDetails,
} from "@/lib/studentEmail";

export type InvoiceEmailData = {
  studentName: string;
  invoiceNumber: string;
  currency: string;
  intake: string | null;
  destination: string | null;
  /** What the fee line is called — the visa service's name on a visa-only invoice (0279). */
  feeName?: string;
  discountReason: string | null;
  math: InvoiceMath;
  /** One administrative fee per country the student registered for. */
  adminCharges: AdminChargeLine[];
  /** Items added after the invoice was raised; each is a line of the breakdown. */
  lineItems: { name: string; description?: string | null; amount: number }[];
  installments: {
    no: number;
    amount: number;
    dueDate: string | null;
    dueCondition?: string | null;
    paid: boolean;
    /** The part of this instalment that is added items plus their tax. */
    extrasAmount?: number;
  }[];
  amountPaid: number;
  balanceDue: number;
  receiptUrl: string;
  /**
   * Same invoice, three framings: the original bill, a reminder once an
   * installment is past due, and an acknowledgement once money has arrived.
   */
  variant?: "invoice" | "overdue" | "receipt";
  /** Who the invoice is from (Invoice Settings). Defaults to HMARK's name. */
  companyName?: string;
  /** What the tax is called on the invoice (Invoice Settings). */
  taxLabel?: string;
  /** The office at the foot (Setup › Invoice settings); HMARK's defaults without it. */
  office?: OfficeDetails;
  /** The portal's address, for the hosted images. */
  siteUrl?: string;
  /** Image sources in place of the hosted ones — a preview sends them inline. */
  images?: Images;
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

// An installment that falls due on an event has no date. The wording goes
// where the date would have been rather than leaving a dash the student has
// to ask about.
function dueText(i: { dueDate: string | null; dueCondition?: string | null }) {
  if (i.dueDate) return `due ${fmtDate(i.dueDate)}`;
  return i.dueCondition ? i.dueCondition.toLowerCase() : "due —";
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

export function buildInvoiceEmail(data: InvoiceEmailData) {
  const { math } = data;
  const overdue = data.variant === "overdue";
  const receipt = data.variant === "receipt";
  const settled = receipt && data.balanceDue <= 0;

  // Who it is from, as Invoice Settings names the company.
  const company = data.companyName?.trim() || "HMARK Consultants";

  // "Receipt", not "Receipt for invoice": what is being sent against a payment
  // of the administrative and consultancy fee is a receipt, and a subject line
  // carrying both words makes a student look for an invoice they do not owe.
  const subject = receipt
    ? `Receipt ${data.invoiceNumber} — ${money(data.currency, data.amountPaid)} received`
    : overdue
      ? `Payment overdue — Invoice ${data.invoiceNumber} — ${money(data.currency, data.balanceDue)} outstanding`
      : `Invoice ${data.invoiceNumber} from ${company} — ${money(data.currency, data.balanceDue)} due`;

  // The one figure the reader opened the mail for.
  const heroLabel = receipt ? "Payment received" : overdue ? "Payment overdue" : "Amount due";
  const heroValue = receipt ? data.amountPaid : data.balanceDue;

  const preheader = receipt
    ? settled
      ? `Thank you — nothing further is outstanding on ${data.invoiceNumber}.`
      : `${money(data.currency, data.balanceDue)} still outstanding on ${data.invoiceNumber}.`
    : overdue
      ? `${money(data.currency, data.balanceDue)} is past its due date.`
      : `Your invoice from ${company}${data.intake ? ` for the ${data.intake} intake` : ""}.`;

  // A receipt for a settled invoice should not also tell the student where to
  // send money. It still does when something is left to pay, since a part
  // payment is acknowledged and chased in the same breath.
  //
  // Only when there is somewhere to pay — bank details, or a payment note on
  // its own. With the bank fields empty, the email says nothing about a bank
  // (the settings row always exists, so its presence proved nothing).
  const showBank = hasPaymentInstructions(data.bank) && !settled;

  const breakdown: [string, string][] = [
    [feeLineLabel(data.feeName ?? "Consultancy fee", data.destination), amount(math.consultancyFee)],
  ];
  if (math.discountAmount > 0) {
    breakdown.push([`Discount${data.discountReason ? ` · ${data.discountReason}` : ""}`, `− ${amount(math.discountAmount)}`]);
  }
  // Added items sit with the fee they are taxed alongside, each on its own
  // line, so the student can see what every figure in the total is for.
  // The description rides on the same line rather than a second one: an email
  // breakdown is a two-column table and a row without a figure reads as a
  // charge with no amount.
  for (const li of data.lineItems) {
    breakdown.push([li.description ? `${li.name} · ${li.description}` : li.name, amount(li.amount)]);
  }
  if (math.taxAmount > 0) breakdown.push([`${data.taxLabel?.trim() || "SRB tax"} · ${math.taxRate}%`, amount(math.taxAmount)]);
  // One line per country, as on the receipt. A student with backup countries
  // is paying an administrative fee for each and should be able to see which.
  if (data.adminCharges.length > 0) {
    for (const c of data.adminCharges.filter((x) => x.amount > 0)) {
      breakdown.push([feeLineLabel("Administrative fee", c.label, c.isBackup), amount(c.amount)]);
    }
  } else if (math.adminCharge > 0) {
    breakdown.push([feeLineLabel("Administrative fee", data.destination), amount(math.adminCharge)]);
  }

  // Installment 1 carries the whole administrative charge, and an added item
  // lands on whichever instalment was next to be paid — see
  // buildInstallmentPlan and invoiceSchedule. Unexplained, a bigger payment
  // reads as an error. The same sentence as the receipt and the Payments page.
  const noteFor = (i: { no: number; extrasAmount?: number }) =>
    installmentNote({ installment_no: i.no, extras_amount: i.extrasAmount ?? 0 }, math, (n) => money(data.currency, n));

  // ---- plain text (what a text-only client, and most spam filters, see) ----
  const text = [
    `Dear ${data.studentName},`,
    ``,
    receipt
      ? `Thank you — we have received ${money(data.currency, data.amountPaid)} against invoice ${data.invoiceNumber}.${settled ? " Nothing further is outstanding." : ` ${money(data.currency, data.balanceDue)} remains outstanding.`}`
      : overdue
        ? `One or more installments on invoice ${data.invoiceNumber} are now past their due date. Please arrange payment at your earliest convenience.`
        : `Please find your invoice ${data.invoiceNumber} from ${company}${data.destination ? ` for ${data.destination}` : ""}${data.intake ? ` (${data.intake} intake)` : ""}.`,
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
    ...data.installments.map((i) => {
      const note = noteFor(i);
      return `  ${i.no}. ${money(data.currency, i.amount)} — ${i.paid ? "paid" : dueText(i)}${note ? ` · ${note}` : ""}`;
    }),
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
        ]
      : []),
    ``,
    `If anything here looks wrong, reply to this email and your counselor will check it.`,
    ``,
    company,
  ]
    .filter((l) => l !== "")
    .join("\n");

  // ---- HTML, in the student's house style (studentEmail.ts) ----
  const tone = receipt ? GREEN : overdue ? AMBER : INK;
  const office: OfficeDetails = data.office ?? { ...DEFAULT_OFFICE, name: company };
  const siteUrl = data.siteUrl ?? "https://portal.hmarkconsultants.com";

  const line = (label: string, value: string, opts: { strong?: boolean; color?: string; rule?: boolean } = {}) => {
    const pad = opts.rule ? "12px 0 0" : "6px 0";
    const border = opts.rule ? `border-top:1px solid ${HAIR};` : "";
    const weight = opts.strong ? "700" : "400";
    return `<tr>
      <td style="padding:${pad};${border}font-family:${FONT};font-size:14px;line-height:20px;font-weight:${weight};color:${opts.color ?? (opts.strong ? INK : BODY)}">${esc(label)}</td>
      <td style="padding:${pad};${border}text-align:right;white-space:nowrap;font-family:${NUM};font-size:14px;line-height:20px;font-weight:${weight};color:${opts.color ?? INK}">${esc(value)}</td>
    </tr>`;
  };

  // The one figure the email was opened for, large, in the colour of what it says.
  const figure = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${receipt ? MINT : overdue ? AMBER_BG : "#f6f8f7"};border:1px solid ${receipt ? MINT_EDGE : overdue ? AMBER_EDGE : HAIR};border-radius:16px"><tr><td style="padding:20px 22px">
    ${label(overdue ? "Outstanding now" : heroLabel, receipt ? GREEN : overdue ? AMBER : FAINT)}
    <div class="big" style="font-family:${NUM};font-size:36px;line-height:42px;font-weight:800;color:${tone};letter-spacing:-.5px;margin-top:4px"><span style="font-family:${FONT};font-size:16px;font-weight:700;color:${FAINT};letter-spacing:.5px">${esc(data.currency)}</span>&nbsp;${esc(amount(heroValue))}</div>
    <div style="font-family:${FONT};font-size:13px;line-height:19px;color:${BODY};margin-top:6px">${receipt ? "Receipt" : "Invoice"} <span style="font-family:${NUM};color:${INK};font-weight:600">${esc(data.invoiceNumber)}</span>${data.destination ? ` &middot; ${esc(data.destination)}` : ""}${data.intake ? ` &middot; ${esc(data.intake)} intake` : ""}</div>
    ${receipt && !settled ? `<div style="font-family:${FONT};font-size:13px;line-height:19px;color:${BODY};margin-top:4px">Still to pay: <span style="font-family:${NUM};font-weight:700;color:${INK}">${esc(money(data.currency, data.balanceDue))}</span></div>` : ""}
  </td></tr></table>`;

  const breakdownCard = `${heading("The breakdown", 26)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${HAIR};border-radius:14px"><tr><td style="padding:14px 18px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${breakdown.map(([l, v]) => line(l, v)).join("")}
      ${line("Total", amount(math.total), { strong: true, rule: true })}
      ${data.amountPaid > 0 ? line("Received", `− ${amount(data.amountPaid)}`, { color: GREEN }) : ""}
      ${line("Balance", amount(data.balanceDue), { strong: true, color: data.balanceDue <= 0 ? GREEN : INK, rule: true })}
    </table>
    <div style="padding:10px 0 0;font-family:${FONT};font-size:12px;color:${FAINT}">All amounts in ${esc(data.currency)}.</div>
  </td></tr></table>`;

  const pill = (paid: boolean, words: string) =>
    `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;background:${paid ? MINT : "#f2f4f3"};color:${paid ? GREEN : BODY}">${esc(words)}</span>`;
  const scheduleCard =
    data.installments.length > 1
      ? `${heading("Payment schedule", 26)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${HAIR};border-radius:14px"><tr><td style="padding:6px 18px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${data.installments
      .map(
        (i, n) => `<tr>
      <td style="padding:10px 0;${n > 0 ? `border-top:1px solid ${HAIR};` : ""}font-family:${FONT};font-size:14px;line-height:20px;color:${INK}">
        <span style="color:${FAINT}">${i.no}.</span>&nbsp;<span style="font-family:${NUM};font-weight:700">${esc(money(data.currency, i.amount))}</span>${noteFor(i) ? `<div style="font-size:12px;line-height:17px;color:${FAINT}">${esc(noteFor(i))}</div>` : ""}
      </td>
      <td style="padding:10px 0;${n > 0 ? `border-top:1px solid ${HAIR};` : ""}text-align:right;white-space:nowrap">${pill(i.paid, i.paid ? "Paid" : i.dueDate ? `Due ${fmtDate(i.dueDate)}` : (i.dueCondition ?? "Due —"))}</td>
    </tr>`
      )
      .join("")}</table>
  </td></tr></table>`
      : "";

  const bankCard =
    showBank && data.bank
      ? `${heading("Where to pay", 26)}${card(
          rows(
            [
              data.bank.accountTitle ? ["Account title", esc(data.bank.accountTitle)] : null,
              data.bank.bankName ? ["Bank", `${esc(data.bank.bankName)}${data.bank.branch ? `, ${esc(data.bank.branch)}` : ""}`] : null,
              data.bank.accountNumber ? ["Account no.", `<span style="font-family:${NUM}">${esc(data.bank.accountNumber)}</span>`] : null,
              data.bank.iban ? ["IBAN", `<span style="font-family:${NUM}">${esc(data.bank.iban)}</span>`] : null,
              data.bank.swiftCode ? ["SWIFT", `<span style="font-family:${NUM}">${esc(data.bank.swiftCode)}</span>`] : null,
              ["Reference", `<span style="font-family:${NUM}">${esc(data.invoiceNumber)}</span>`],
            ].filter((r): r is [string, string] => r !== null)
          ) + (data.bank.paymentNote ? `<div style="font-family:${FONT};font-size:13px;line-height:19px;color:${FAINT};margin-top:8px">${esc(data.bank.paymentNote)}</div>` : ""),
          { tint: true }
        )}`
      : "";

  const opening = receipt
    ? `Thank you, ${esc(displayName(data.studentName))} — your payment has been received${settled ? " and nothing further is outstanding" : ""}.`
    : overdue
      ? `${esc(displayName(data.studentName))}, one or more instalments on this invoice are now past their due date. Please arrange payment at your earliest convenience.`
      : `${esc(displayName(data.studentName))}, here is your invoice from ${esc(company)}. The amount due, how it is made up, and when each part falls due are all below.`;

  const html = emailFrame({
    subject,
    preheader,
    banner: receipt ? "receipt" : overdue ? "overdue" : "invoice",
    eyebrow: receipt ? (settled ? "Paid in full" : "Payment received") : overdue ? "Payment overdue" : "Your invoice",
    eyebrowTone: overdue ? "amber" : "green",
    title: receipt ? (settled ? "Thank you — you're all paid up" : "Thank you — payment received") : overdue ? "A payment is past its date" : `Invoice ${data.invoiceNumber}`,
    intro: [opening],
    content: [
      `<div style="height:6px;line-height:6px;font-size:0">&nbsp;</div>`,
      figure,
      breakdownCard,
      scheduleCard,
      button(data.receiptUrl, `${receipt ? "View your receipt" : "View your invoice"} &rarr;`, overdue ? "amber" : "green"),
      `<div style="padding:10px 2px 0;font-family:${FONT};font-size:12px;color:${FAINT}">Opens in your browser &mdash; print or save it from there.</div>`,
      bankCard,
      callout(esc("If anything here looks wrong, reply to this email and your counsellor will check it. The link is personal to you — please don't forward it."), {
        tone: "green",
        icon: "&#128172;",
      }),
    ].join(""),
    signoff: receipt ? "Thank you for your trust in us," : "Warm regards,",
    office,
    siteUrl,
    images: data.images,
    reason: `You are receiving this because you are registered with ${office.name}.`,
  });

  return { subject, text, html };
}

