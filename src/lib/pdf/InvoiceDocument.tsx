import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const GREEN = "#146856";
const GREEN_SOFT = "#E4F2ED";
const INK = "#1B2420";
const INK_SOFT = "#57625C";
const INK_FAINT = "#8B928B";
const RULE = "#D6D3C8";
const DUE = "#A05A20";
const DUE_BG = "#F3E7D6";

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 9.5, color: INK, fontFamily: "Helvetica" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: GREEN },
  brandWord: { fontFamily: "Times-Bold", fontSize: 20, color: GREEN },
  brandSub: { fontSize: 7.5, letterSpacing: 2, color: INK_SOFT, marginTop: 2 },
  companyBlock: { textAlign: "right", fontSize: 8, color: INK_FAINT, lineHeight: 1.5 },
  companyBold: { color: INK_SOFT, fontFamily: "Helvetica-Bold" },

  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 16 },
  docTitle: { fontFamily: "Times-Bold", fontSize: 17, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  statusPill: { alignSelf: "flex-start", fontSize: 7.5, letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: DUE_BG, color: DUE },
  statusPillPaid: { backgroundColor: GREEN_SOFT, color: GREEN },
  docMeta: { fontFamily: "Courier", fontSize: 8.5, color: INK_SOFT, marginTop: 8, lineHeight: 1.7 },

  dueCallout: { backgroundColor: GREEN_SOFT, paddingHorizontal: 14, paddingVertical: 8, minWidth: 140 },
  dueLabel: { fontFamily: "Courier", fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: GREEN },
  dueAmount: { fontFamily: "Courier-Bold", fontSize: 16, color: GREEN, marginTop: 2 },

  infoGrid: { flexDirection: "row", gap: 28, marginTop: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: RULE, borderBottomWidth: 1, borderBottomColor: RULE },
  infoCol: { flex: 1, minWidth: 0 },
  infoLabel: { fontFamily: "Courier-Bold", fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: GREEN, marginBottom: 6 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  infoKey: { color: INK_FAINT, fontSize: 8.5 },
  infoVal: { color: INK, fontSize: 8.5, fontFamily: "Helvetica-Bold" },

  sectionLabel: { fontFamily: "Courier-Bold", fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: GREEN, marginTop: 16, marginBottom: 6 },

  tableHeadRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#B8B6A9", paddingBottom: 5, marginBottom: 2 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 0.4, textTransform: "uppercase", color: INK_FAINT },

  feeRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: RULE, paddingVertical: 8 },
  feeName: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  feeDesc: { fontSize: 7.8, color: INK_FAINT, marginTop: 3, lineHeight: 1.5 },
  feeNum: { fontFamily: "Courier", fontSize: 9 },

  ledgerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: RULE, paddingVertical: 7, alignItems: "center" },
  ledgerMethod: { fontSize: 8.5, color: INK_FAINT },
  ledgerNum: { fontFamily: "Courier", fontSize: 9 },

  totals: { alignItems: "flex-end", marginTop: 14 },
  totalsBox: { width: 190 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { color: INK_SOFT, fontSize: 8.5 },
  totalsNum: { fontFamily: "Courier", fontSize: 8.5, color: INK },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 8, borderTopWidth: 2, borderTopColor: GREEN },
  balanceLabel: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  balanceNum: { fontFamily: "Courier-Bold", fontSize: 13, color: GREEN },

  foot: { flexDirection: "row", marginTop: 26, justifyContent: "space-between" },
  payInstr: { fontSize: 8, color: INK_SOFT, lineHeight: 1.8, maxWidth: 260 },
  payCode: { fontFamily: "Courier", fontSize: 8, color: INK },
  signBlock: { alignItems: "flex-end" },
  signName: { fontFamily: "Times-Bold", fontSize: 11 },
  signLine: { borderTopWidth: 1, borderTopColor: INK_FAINT, paddingTop: 4, marginTop: 30, fontSize: 7.5, color: INK_FAINT },

  legal: { marginTop: 22, paddingTop: 10, borderTopWidth: 1, borderTopColor: RULE, fontSize: 7.5, color: INK_FAINT, lineHeight: 1.6, textAlign: "center" },
  legalItalic: { fontFamily: "Helvetica-Oblique", marginTop: 3 },
});

export type InvoicePdfData = {
  invoiceNumber: string;
  status: "unpaid" | "partially_paid" | "paid";
  issuedDate: string;
  dueDate: string | null;
  currencySymbol: string;
  studentName: string;
  studentPhone: string | null;
  studentEmail: string | null;
  destination: string | null;
  intake: string | null;
  counselor: string | null;
  installmentPlan: string | null;
  adminCharge: number;
  consultancyFee: number;
  destinationLabel: string;
  terms: string | null;
  payments: { date: string; method: string | null; amount: number; status: "paid" | "unpaid" }[];
  subtotal: number;
  amountPaid: number;
  balanceDue: number;
  signatoryName: string | null;
};

function money(symbol: string, n: number) {
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const statusLabel = data.status === "paid" ? "Paid in full" : data.status === "partially_paid" ? "Partially paid" : "Unpaid";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          <View>
            <Text style={styles.brandWord}>HMARK</Text>
            <Text style={styles.brandSub}>CONSULTANTS</Text>
          </View>
          <View style={styles.companyBlock}>
            <Text style={styles.companyBold}>HMARK Consultants</Text>
            <Text>Suite 101, Dashityar Chambers, University Road</Text>
            <Text>Gulshan-e-Iqbal, Block 13-C, Karachi, Sindh, Pakistan</Text>
            <Text>+92 21 3499 9777 · +92 334 3297870</Text>
            <Text>www.hmarkconsultants.com</Text>
          </View>
        </View>

        <View style={styles.titleRow}>
          <View>
            <Text style={styles.docTitle}>Invoice</Text>
            <Text style={[styles.statusPill, data.status === "paid" ? styles.statusPillPaid : {}]}>{statusLabel}</Text>
            <Text style={styles.docMeta}>
              No. {data.invoiceNumber}{"\n"}
              Issued {data.issuedDate}
              {data.dueDate ? ` · Due ${data.dueDate}` : ""}
            </Text>
          </View>
          <View style={styles.dueCallout}>
            <Text style={styles.dueLabel}>Amount due</Text>
            <Text style={styles.dueAmount}>{money(data.currencySymbol, data.balanceDue)}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Bill to</Text>
            <View style={styles.infoRow}><Text style={styles.infoKey}>Student</Text><Text style={styles.infoVal}>{data.studentName}</Text></View>
            {data.studentPhone && <View style={styles.infoRow}><Text style={styles.infoKey}>Contact</Text><Text style={styles.infoVal}>{data.studentPhone}</Text></View>}
            {data.studentEmail && <View style={styles.infoRow}><Text style={styles.infoKey}>Email</Text><Text style={styles.infoVal}>{data.studentEmail}</Text></View>}
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Placement</Text>
            {data.destination && <View style={styles.infoRow}><Text style={styles.infoKey}>Destination</Text><Text style={styles.infoVal}>{data.destination}</Text></View>}
            {data.intake && <View style={styles.infoRow}><Text style={styles.infoKey}>Intake</Text><Text style={styles.infoVal}>{data.intake}</Text></View>}
            {data.counselor && <View style={styles.infoRow}><Text style={styles.infoKey}>Counselor</Text><Text style={styles.infoVal}>{data.counselor}</Text></View>}
            {data.installmentPlan && <View style={styles.infoRow}><Text style={styles.infoKey}>Installment plan</Text><Text style={styles.infoVal}>{data.installmentPlan}</Text></View>}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Fee breakdown</Text>
        <View style={styles.tableHeadRow}>
          <Text style={[styles.th, { flex: 3 }]}>Service</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Price</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Amount</Text>
        </View>
        <View style={styles.feeRow}>
          <View style={{ flex: 3 }}>
            <Text style={styles.feeName}>Administrative Charges</Text>
            <Text style={styles.feeDesc}>Administrative charges are non-refundable in any case.</Text>
          </View>
          <Text style={[styles.feeNum, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, data.adminCharge)}</Text>
          <Text style={[styles.feeNum, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, data.adminCharge)}</Text>
        </View>
        <View style={styles.feeRow}>
          <View style={{ flex: 3 }}>
            <Text style={styles.feeName}>{data.destinationLabel}</Text>
            {data.terms && <Text style={styles.feeDesc}>{data.terms}</Text>}
          </View>
          <Text style={[styles.feeNum, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, data.consultancyFee)}</Text>
          <Text style={[styles.feeNum, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, data.consultancyFee)}</Text>
        </View>

        {data.payments.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Payments</Text>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.th, { flex: 1.4 }]}>Date</Text>
              <Text style={[styles.th, { flex: 1.4 }]}>Method</Text>
              <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Amount</Text>
              <Text style={[styles.th, { flex: 1.2, textAlign: "right" }]}>Status</Text>
            </View>
            {data.payments.map((p, i) => (
              <View key={i} style={styles.ledgerRow}>
                <Text style={{ flex: 1.4, fontSize: 8.5 }}>{p.date}</Text>
                <Text style={[styles.ledgerMethod, { flex: 1.4 }]}>{p.method ?? "—"}</Text>
                <Text style={[styles.ledgerNum, { flex: 1, textAlign: "right" }]}>{money(data.currencySymbol, p.amount)}</Text>
                <Text
                  style={[
                    styles.statusPill,
                    p.status === "paid" ? styles.statusPillPaid : {},
                    { flex: 1.2, alignSelf: "flex-end", textAlign: "right" },
                  ]}
                >
                  {p.status === "paid" ? "Received" : "Due"}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}><Text style={styles.totalsLabel}>Subtotal</Text><Text style={styles.totalsNum}>{money(data.currencySymbol, data.subtotal)}</Text></View>
            <View style={styles.totalsRow}><Text style={styles.totalsLabel}>Amount paid</Text><Text style={styles.totalsNum}>−{money(data.currencySymbol, data.amountPaid)}</Text></View>
            <View style={styles.balanceRow}><Text style={styles.balanceLabel}>Balance due</Text><Text style={styles.balanceNum}>{money(data.currencySymbol, data.balanceDue)}</Text></View>
          </View>
        </View>

        <View style={styles.foot}>
          <View style={styles.payInstr}>
            <Text style={styles.infoLabel}>Payment instructions</Text>
            <Text>Account title <Text style={styles.payCode}>HMARK Consultants (Pvt.) Ltd.</Text></Text>
            <Text>Bank <Text style={styles.payCode}>Meezan Bank, Shahrah-e-Faisal Br.</Text></Text>
            <Text>IBAN <Text style={styles.payCode}>PK00 MEZN 0000 0000 1234 5678</Text></Text>
            <Text>SWIFT <Text style={styles.payCode}>MEZNPKKA</Text> · Ref. <Text style={styles.payCode}>{data.invoiceNumber}</Text></Text>
          </View>
          {data.signatoryName && (
            <View style={styles.signBlock}>
              <Text style={styles.signName}>{data.signatoryName}</Text>
              <Text style={styles.signLine}>Authorized Signatory, HMARK Consultants</Text>
            </View>
          )}
        </View>

        <View style={styles.legal}>
          <Text>Instalments unpaid past their due date may delay document submission on the student&apos;s application. For queries, contact accounts@hmarkconsultants.com.</Text>
          <Text style={styles.legalItalic}>HMARK Consultants reserves the right, in its sole discretion, to cancel the scholarship or admission.</Text>
        </View>
      </Page>
    </Document>
  );
}
