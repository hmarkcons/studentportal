import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { BRAND_LOGO_DATA_URI, BRAND_LOGO_RATIO } from "./brandLogo";
import { pkrLine, pkrRateNote } from "../receiptPkr";
import { feeLineLabel, type AdminChargeLine } from "../invoiceMath";

// Never break a word across lines.
//
// react-pdf hyphenates by default, which put "On admission ap- proval from
// your first public university" in the schedule's narrow date column. On a
// financial document a hyphenated word reads as a typo, and this is a column
// of short phrases where wrapping at spaces is always available.
Font.registerHyphenationCallback((word) => [word]);

// Laid out to match HMARK's existing Wave-generated invoice
// (reference/Invoice Samples/Invoice Sample - WaveApps.pdf) so students who
// have had one before recognise this one: neutral greys rather than brand
// colour, a right-aligned label/value meta block, and the shaded Amount Due
// band. The SRB tax, discount, payment ledger and bank block are ours; they
// are styled to sit inside that layout rather than beside it.
const INK = "#4A4A4A";
const INK_STRONG = "#333333";
const GREY = "#8C8C8C";
const RULE = "#E0E0E0";
const BAND = "#F0F0F0";

const styles = StyleSheet.create({
  page: { paddingHorizontal: 40, paddingTop: 32, paddingBottom: 64, fontSize: 9.5, color: INK, fontFamily: "Helvetica", lineHeight: 1.45 },

  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandLogo: { height: 46, width: 46 * BRAND_LOGO_RATIO },
  headRight: { textAlign: "right", flex: 1, paddingLeft: 24 },
  docTitle: { fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: 0.5, color: INK, marginBottom: 9 },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: INK_STRONG },
  companyLine: { fontSize: 8.5, color: INK },
  contactLine: { fontSize: 8.5, color: INK },

  rule: { borderBottomWidth: 1, borderBottomColor: RULE, marginTop: 12, marginBottom: 12 },

  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  billTo: { flex: 1, paddingRight: 24 },
  billLabel: { fontSize: 9, color: GREY, marginBottom: 3 },
  billName: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: INK_STRONG },
  billLine: { fontSize: 9, color: INK },

  metaBlock: { width: 250 },
  metaLine: { flexDirection: "row", alignItems: "baseline", marginBottom: 2 },
  metaKey: { width: 128, textAlign: "right", paddingRight: 10, fontFamily: "Helvetica-Bold", fontSize: 9, color: INK_STRONG },
  metaVal: { flex: 1, fontSize: 9, color: INK },
  dueBand: { flexDirection: "row", alignItems: "baseline", backgroundColor: BAND, paddingVertical: 5, marginTop: 4 },

  tableHead: { flexDirection: "row", marginTop: 18, paddingBottom: 6 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: INK_STRONG },
  thinRule: { borderBottomWidth: 1, borderBottomColor: RULE },

  itemRow: { flexDirection: "row", paddingTop: 9, paddingBottom: 3 },
  itemName: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: INK_STRONG },
  itemDesc: { fontSize: 9, color: INK, marginTop: 1 },
  num: { fontSize: 9.5, color: INK },

  itemsEnd: { borderBottomWidth: 2, borderBottomColor: RULE, marginTop: 10 },

  totals: { alignSelf: "flex-end", width: 300, marginTop: 8 },
  totalsRow: { flexDirection: "row", alignItems: "baseline", paddingVertical: 2 },
  totalsKey: { flex: 1, textAlign: "right", paddingRight: 14, fontSize: 9.5, color: INK },
  totalsKeyBold: { fontFamily: "Helvetica-Bold", color: INK_STRONG },
  totalsNum: { width: 96, textAlign: "right", fontSize: 9.5, color: INK },
  // The rupee figure sits under its euro one, smaller and grey: the receipt is
  // denominated in euro and this is the same number said again.
  pkrNum: { width: 96, textAlign: "right", fontSize: 8, color: GREY, marginTop: -1, marginBottom: 2 },
  pkrRowWrap: { flexDirection: "row", alignItems: "baseline" },
  totalsNumBold: { fontFamily: "Helvetica-Bold", fontSize: 11, color: INK_STRONG },
  totalsRule: { borderTopWidth: 1, borderTopColor: RULE, marginTop: 6, paddingTop: 8 },

  // Payments received, called out. A tinted band rather than a colour alone,
  // so it still reads as emphasised on the black-and-white printer the office
  // actually uses.
  paidRow: { backgroundColor: "#eef7ef", paddingHorizontal: 6, paddingVertical: 3, marginVertical: 2 },
  paidText: { color: "#1f7a35" },

  sectionLabel: { fontSize: 9, color: GREY, marginTop: 16, marginBottom: 5 },
  ledgerRow: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE },

  payRow: { flexDirection: "row", gap: 24 },
  payBlock: { width: 215 },
  scheduleBlock: { flex: 1 },
  payLine: { fontSize: 9, color: INK },
  payValue: { fontFamily: "Helvetica-Bold", color: INK_STRONG },

  note: { marginTop: 12, fontSize: 8.5, color: INK, lineHeight: 1.5 },

  foot: { position: "absolute", left: 40, right: 40, bottom: 22, textAlign: "center", fontSize: 8.5, color: GREY, lineHeight: 1.6 },
});

export type InvoicePdfData = {
  invoiceNumber: string;
  status: "unpaid" | "partially_paid" | "paid";
  issuedDate: string;
  dueDate: string | null;
  currencySymbol: string;
  /** ISO code shown in the "Amount Due (PKR):" labels, as in the Wave layout. */
  currencyCode: string;
  studentName: string;
  studentPhone: string | null;
  studentEmail: string | null;
  destination: string | null;
  intake: string | null;
  installmentPlan: string | null;
  adminCharge: number;
  /** One administrative fee per country the student registered for. Empty on
   *  an invoice raised before the breakdown existed, which prints one
   *  unlabelled row for adminCharge instead. */
  adminCharges: AdminChargeLine[];
  /** What the fee row is called: "Consultancy Fee", or the visa service's
   *  name on a visa-only invoice (0279). */
  feeName?: string;
  consultancyFee: number;
  // Discount comes off the consultancy fee, then SRB tax is charged on what
  // remains — see computeInvoiceMath, which is where these are produced.
  discountAmount: number;
  discountReason: string | null;
  netConsultancyFee: number;
  /** Items added after the invoice was raised — a product from the fee
   *  catalog or a custom charge. Each is its own row in the Service table. */
  lineItems: { name: string; description?: string | null; amount: number }[];
  extrasAmount: number;
  /** What the tax was charged on: the net consultancy fee plus the items. */
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  terms: string | null;
  payments: {
    date: string;
    method: string | null;
    amount: number;
    status: "paid" | "unpaid";
    /** e.g. "incl. admin fee" on the first installment, which carries it. */
    note?: string | null;
  }[];
  subtotal: number;
  amountPaid: number;
  balanceDue: number;
  // Where the student actually sends the money. Read from invoice_settings so
  // it is maintained in Setup rather than hardcoded into this document.
  bank: {
    bankName: string | null;
    accountTitle: string | null;
    accountNumber: string | null;
    iban: string | null;
    branch: string | null;
    swiftCode: string | null;
    paymentNote: string | null;
  } | null;
  /** Set when the invoice currency differs from the account currency. */
  conversionNote: string | null;
  /**
   * Rupees per euro, as stamped on this invoice when it was issued.
   *
   * Null on an invoice issued before the rate existed: those print in euro
   * only rather than restating themselves at a rate nobody quoted.
   */
  pkrPerEur?: number | null;
};

function money(symbol: string, n: number) {
  return `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * A euro figure said again in rupees, directly under it.
 *
 * Renders nothing when the invoice carries no rate — an invoice issued before
 * the rate existed was never quoted in rupees.
 */
function Pkr({ amount, rate, bold = false }: { amount: number; rate: number | null | undefined; bold?: boolean }) {
  const line = pkrLine(amount, rate);
  if (!line) return null;
  return (
    <View style={styles.pkrRowWrap}>
      <Text style={styles.totalsKey} />
      <Text style={[styles.pkrNum, bold ? { color: INK } : {}]}>{line}</Text>
    </View>
  );
}

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  // Wave prints RECEIPT once nothing is outstanding and INVOICE while it is,
  // which is also what the emailed "View receipt" button leads to.
  const title = data.status === "paid" ? "RECEIPT" : "INVOICE";
  // The headline band celebrates what was received on a settled invoice; the
  // totals column below always closes on what is still owed, so the arithmetic
  // reads straight down (Total, less payments, balance).
  const bandLabel = data.status === "paid" ? `Amount Paid (${data.currencyCode}):` : `Amount Due (${data.currencyCode}):`;
  const bandValue = data.status === "paid" ? data.amountPaid : data.balanceDue;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          <Image src={BRAND_LOGO_DATA_URI} style={styles.brandLogo} />
          <View style={styles.headRight}>
            <Text style={styles.docTitle}>{title}</Text>
            <Text style={styles.companyName}>HMARK Consultants</Text>
            <Text style={styles.companyLine}>Suite 101, Dashityar Chambers, University Road, Gulshan-e-Iqbal, Block 13-C</Text>
            <Text style={styles.companyLine}>Karachi, Sindh</Text>
            <Text style={styles.companyLine}>Pakistan</Text>
            <Text style={[styles.contactLine, { marginTop: 9 }]}>Phone: +92 213 4999777</Text>
            <Text style={styles.contactLine}>Mobile: +92 334 3297870</Text>
            <Text style={styles.contactLine}>www.hmarkconsultants.com</Text>
          </View>
        </View>

        <View style={styles.rule} />

        <View style={styles.metaRow}>
          <View style={styles.billTo}>
            <Text style={styles.billLabel}>BILL TO</Text>
            <Text style={styles.billName}>{data.studentName}</Text>
            {data.studentPhone && <Text style={[styles.billLine, { marginTop: 10 }]}>{data.studentPhone}</Text>}
            {data.studentEmail && <Text style={styles.billLine}>{data.studentEmail}</Text>}
          </View>

          <View style={styles.metaBlock}>
            <View style={styles.metaLine}>
              <Text style={styles.metaKey}>Invoice Number:</Text>
              <Text style={styles.metaVal}>{data.invoiceNumber}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaKey}>Invoice Date:</Text>
              <Text style={styles.metaVal}>{data.issuedDate}</Text>
            </View>
            {/* Only when there is no schedule below to say it better. With a
                schedule this line repeated one of its dates out of context,
                and a reader had two "due" dates to reconcile. */}
            {data.dueDate && data.payments.length === 0 && (
              <View style={styles.metaLine}>
                <Text style={styles.metaKey}>Payment Due:</Text>
                <Text style={styles.metaVal}>{data.dueDate}</Text>
              </View>
            )}
            <View style={styles.dueBand}>
              <Text style={styles.metaKey}>{bandLabel}</Text>
              <Text style={[styles.metaVal, { fontFamily: "Helvetica-Bold", color: INK_STRONG }]}>
                {money(data.currencySymbol, bandValue)}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.tableHead, styles.thinRule]}>
          <Text style={[styles.th, { flex: 3 }]}>Service</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Price</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Amount</Text>
        </View>

        {/* One row per country: a student registers for one primary and up to
            three backups, and each carries its own administrative fee (see
            migration 0257). A backup country's agreement is administrative-fee
            only, so naming the country is what tells the two apart on a
            receipt that lists three of them. Older invoices carry no
            breakdown and print the single charge they were raised with. */}
        {data.adminCharges.length > 0
          ? data.adminCharges
              .filter((c) => c.amount > 0)
              .map((c, i) => (
                <View key={i} style={styles.itemRow}>
                  <View style={{ flex: 3, paddingRight: 16 }}>
                    <Text style={styles.itemName}>{feeLineLabel("Administrative Fee", c.label, c.isBackup)}</Text>
                    <Text style={styles.itemDesc}>The administrative fee is non-refundable in any case.</Text>
                  </View>
                  <Text style={[styles.num, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, c.amount)}</Text>
                  <Text style={[styles.num, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, c.amount)}</Text>
                </View>
              ))
          : data.adminCharge > 0 && (
              <View style={styles.itemRow}>
                <View style={{ flex: 3, paddingRight: 16 }}>
                  <Text style={styles.itemName}>{feeLineLabel("Administrative Fee", data.destination)}</Text>
                  <Text style={styles.itemDesc}>The administrative fee is non-refundable in any case.</Text>
                </View>
                <Text style={[styles.num, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, data.adminCharge)}</Text>
                <Text style={[styles.num, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, data.adminCharge)}</Text>
              </View>
            )}

        <View style={styles.itemRow}>
          <View style={{ flex: 3, paddingRight: 16 }}>
            {/* Named for the country it is for, as the administrative rows
                above are. The consultancy fee is the primary country's — a
                backup never carries one. */}
            <Text style={styles.itemName}>{feeLineLabel(data.feeName ?? "Consultancy Fee", data.destination)}</Text>
            {data.intake && <Text style={styles.itemDesc}>Intake: {data.intake}</Text>}
            {data.installmentPlan && <Text style={styles.itemDesc}>Installment plan: {data.installmentPlan}</Text>}
            {/* The counselor used to be named here. It is a receipt for money,
                not a record of who sold the service, and a student who changes
                counselor should not have to hold a receipt naming the old one. */}
            {data.terms && <Text style={styles.itemDesc}>{data.terms}</Text>}
          </View>
          <Text style={[styles.num, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, data.consultancyFee)}</Text>
          <Text style={[styles.num, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, data.consultancyFee)}</Text>
        </View>

        {/* Added items, one row each, in the table with the two fees rather
            than folded into either. These used to be left off the document
            entirely while counting towards nothing, so an invoice with a
            courier charge on it was printed and collected without it. */}
        {data.lineItems.map((li, i) => (
          <View key={i} style={styles.itemRow}>
            <View style={{ flex: 3, paddingRight: 16 }}>
              <Text style={styles.itemName}>{li.name}</Text>
              {/* A name is a label; some items need a sentence saying what
                  the student is actually paying for. */}
              {li.description && <Text style={styles.itemDesc}>{li.description}</Text>}
            </View>
            <Text style={[styles.num, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, li.amount)}</Text>
            <Text style={[styles.num, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, li.amount)}</Text>
          </View>
        ))}

        <View style={styles.itemsEnd} />

        <View style={styles.totals}>
          {data.discountAmount > 0 && (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsKey}>Subtotal:</Text>
                <Text style={styles.totalsNum}>
                  {money(data.currencySymbol, data.consultancyFee + data.adminCharge + data.extrasAmount)}
                </Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsKey}>
                  Discount{data.discountReason ? ` (${data.discountReason})` : ""}:
                </Text>
                {/* ASCII hyphen, not U+2212: the PDF base fonts have no glyph
                    for the true minus sign and it prints as nothing, which
                    turns a deduction into an addition. */}
                <Text style={styles.totalsNum}>-{money(data.currencySymbol, data.discountAmount)}</Text>
              </View>
            </>
          )}
          {data.taxAmount > 0 && (
            <View style={styles.totalsRow}>
              {/* The base is named so the figure is checkable: the net fee,
                  plus any added items, which are taxed at the same rate. */}
              <Text style={styles.totalsKey}>SRB Tax ({data.taxRate}% of {money(data.currencySymbol, data.taxableAmount)}):</Text>
              <Text style={styles.totalsNum}>{money(data.currencySymbol, data.taxAmount)}</Text>
            </View>
          )}
          <View style={styles.totalsRow}>
            <Text style={[styles.totalsKey, styles.totalsKeyBold]}>Total:</Text>
            <Text style={[styles.totalsNum, { fontFamily: "Helvetica-Bold", color: INK_STRONG }]}>
              {money(data.currencySymbol, data.subtotal)}
            </Text>
          </View>
          <Pkr amount={data.subtotal} rate={data.pkrPerEur} />
          {/* What has been received, emphasised rather than printed as one
              more grey row. On a part-paid invoice this is the figure a student
              checks against their own records first, and a mismatch here is
              what brings them to the office. */}
          {data.amountPaid > 0 && (
            <View style={[styles.totalsRow, styles.paidRow]}>
              <Text style={[styles.totalsKey, styles.totalsKeyBold, styles.paidText]}>Payments Received:</Text>
              <Text style={[styles.totalsNum, styles.totalsNumBold, styles.paidText]}>
                -{money(data.currencySymbol, data.amountPaid)}
              </Text>
            </View>
          )}
          {data.amountPaid > 0 && <Pkr amount={data.amountPaid} rate={data.pkrPerEur} />}
          <View style={[styles.totalsRow, styles.totalsRule]}>
            <Text style={[styles.totalsKey, styles.totalsKeyBold]}>Amount Due ({data.currencyCode}):</Text>
            <Text style={[styles.totalsNum, styles.totalsNumBold]}>{money(data.currencySymbol, data.balanceDue)}</Text>
          </View>
          <Pkr amount={data.balanceDue} rate={data.pkrPerEur} bold />
        </View>

        {/* Side by side so a routine invoice — fee, schedule and where to pay —
            still lands on one page, as the Wave original did. */}
        <View style={styles.payRow}>
          {/* Driven by invoice_settings. Previously hardcoded placeholder account
              numbers were printed here, which would have sent students to a bank
              account that does not exist — so when nothing is configured, say so
              rather than inventing details. */}
          <View style={styles.payBlock}>
            <Text style={styles.sectionLabel}>PAYMENT INSTRUCTIONS</Text>
            {data.bank?.accountTitle && (
              <Text style={styles.payLine}>Account Title: <Text style={styles.payValue}>{data.bank.accountTitle}</Text></Text>
            )}
            {data.bank?.bankName && (
              <Text style={styles.payLine}>
                Bank: <Text style={styles.payValue}>{data.bank.bankName}{data.bank.branch ? `, ${data.bank.branch}` : ""}</Text>
              </Text>
            )}
            {data.bank?.accountNumber && (
              <Text style={styles.payLine}>Account Number: <Text style={styles.payValue}>{data.bank.accountNumber}</Text></Text>
            )}
            {data.bank?.iban && <Text style={styles.payLine}>IBAN: <Text style={styles.payValue}>{data.bank.iban}</Text></Text>}
            {data.bank?.swiftCode && <Text style={styles.payLine}>SWIFT: <Text style={styles.payValue}>{data.bank.swiftCode}</Text></Text>}
            <Text style={styles.payLine}>Payment Reference: <Text style={styles.payValue}>{data.invoiceNumber}</Text></Text>
            {data.bank?.paymentNote && <Text style={styles.payLine}>{data.bank.paymentNote}</Text>}
            {!data.bank?.accountTitle && !data.bank?.bankName && !data.bank?.iban && !data.bank?.accountNumber && (
              <Text style={styles.payLine}>Bank details not yet configured — set them in Setup &rsaquo; Invoice Settings.</Text>
            )}
          </View>

          {data.payments.length > 0 && (
            <View style={styles.scheduleBlock}>
              <Text style={styles.sectionLabel}>PAYMENT SCHEDULE</Text>
              <View style={[styles.ledgerRow, { paddingVertical: 0, paddingBottom: 5 }]}>
                <Text style={[styles.th, { flex: 1.5 }]}>Date</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>Method</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: "right" }]}>Amount</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Status</Text>
              </View>
              {data.payments.map((p, i) => (
                <View key={i} style={styles.ledgerRow}>
                  <View style={{ flex: 1.5 }}>
                    <Text style={{ fontSize: 8.5 }}>{p.date}</Text>
                    {/* Installment 1 is larger than the rest because the
                        administrative charge is collected with it. Unexplained,
                        that reads as a billing error. */}
                    {p.note && <Text style={{ fontSize: 7.5, color: GREY }}>{p.note}</Text>}
                  </View>
                  <Text style={{ flex: 1.5, fontSize: 8.5, color: GREY }}>{p.method ?? "—"}</Text>
                  <View style={{ flex: 1.2 }}>
                    <Text style={{ fontSize: 8.5, textAlign: "right" }}>{money(data.currencySymbol, p.amount)}</Text>
                    {pkrLine(p.amount, data.pkrPerEur) && (
                      <Text style={{ fontSize: 7.5, textAlign: "right", color: GREY }}>{pkrLine(p.amount, data.pkrPerEur)}</Text>
                    )}
                  </View>
                  <Text style={{ flex: 1, fontSize: 8.5, textAlign: "right", color: p.status === "paid" ? INK_STRONG : GREY }}>
                    {p.status === "paid" ? "Received" : "Due"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Said once, at the foot, so the rupee figures above are checkable
            and it is clear which rate they were struck at. */}
        {pkrRateNote(data.pkrPerEur) && (
          <View style={styles.note}>
            <Text>{pkrRateNote(data.pkrPerEur)}</Text>
          </View>
        )}

        {data.conversionNote && (
          <View style={styles.note}>
            <Text>{data.conversionNote}</Text>
          </View>
        )}

        {/* Fixed to the bottom of the page like Wave's, so the closing line sits
            in the same place whether the invoice runs long or short. */}
        <View style={styles.foot} fixed>
          <Text>
            Instalments unpaid past their due date may delay document submission on the student&apos;s application. For queries,
            contact accounts@hmarkconsultants.com.
          </Text>
          <Text>HMARK Consultants reserves the rights, in its sole discretion, to cancel the scholarship or admission.</Text>
        </View>
      </Page>
    </Document>
  );
}
