import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { AgreementBlock, TextRun } from "./agreementContent";
import { BRAND_LOGO_DATA_URI, BRAND_LOGO_RATIO } from "./brandLogo";

const GREEN = "#146856";
const INK = "#1B2420";
const INK_SOFT = "#4A544E";
const RULE = "#B8B6A9";

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 70, paddingHorizontal: 44, fontSize: 9, color: INK, fontFamily: "Times-Roman" },

  header: { flexDirection: "row", alignItems: "center", paddingBottom: 8, marginBottom: 10, borderBottomWidth: 2, borderBottomColor: GREEN },
  brand: { flex: 1 },
  brandLogo: { height: 26, width: 26 * BRAND_LOGO_RATIO },
  headerTitle: { textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 9, color: INK, marginRight: 8 },
  headerPage: { width: 24, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11, color: GREEN, borderLeftWidth: 1, borderLeftColor: RULE, paddingLeft: 8 },

  footer: { position: "absolute", bottom: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  footerDate: { fontSize: 9, color: INK_SOFT },
  sigBox: { width: 220, borderWidth: 1, borderColor: INK },
  sigBoxLabel: { textAlign: "center", fontSize: 7.5, fontFamily: "Helvetica-Bold", paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: INK },
  sigBoxCells: { flexDirection: "row", height: 42 },
  sigBoxCell: { flex: 1, alignItems: "center", justifyContent: "center" },
  sigBoxCellDivider: { borderLeftWidth: 1, borderLeftColor: INK },
  sigBoxImg: { position: "absolute", width: 80, height: 100.5, top: -42, left: 15 },

  table: { borderWidth: 1, borderColor: INK, marginBottom: 10 },
  tRow: { flexDirection: "row" },
  tCell: { flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: INK, padding: 4, fontSize: 8 },
  tCellLast: { borderRightWidth: 0 },
  tCellFull: { flex: 1, borderBottomWidth: 1, borderColor: INK, padding: 4, fontSize: 8 },
  tLabel: { fontFamily: "Helvetica-Bold" },

  feeTable: { borderWidth: 1, borderColor: INK, marginVertical: 8 },
  feeRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: INK },
  feeRowLast: { borderBottomWidth: 0 },
  feeLabel: { flex: 4, padding: 5, fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  feeValue: { flex: 1, padding: 5, fontSize: 8.5, fontFamily: "Helvetica-Bold", textAlign: "right", borderLeftWidth: 1, borderColor: INK },

  richHeading1: { fontFamily: "Times-Bold", fontSize: 12, marginTop: 8, marginBottom: 3, lineHeight: 1.35 },
  richHeading2: { fontFamily: "Times-Bold", fontSize: 10.5, marginTop: 7, marginBottom: 3, lineHeight: 1.35 },
  richHeading3: { fontFamily: "Times-Bold", fontSize: 9.5, marginTop: 6, marginBottom: 2, lineHeight: 1.35 },
  richParagraph: { fontSize: 9, marginBottom: 4, textAlign: "justify", lineHeight: 1.35 },
  richListItemRow: { flexDirection: "row", marginBottom: 3 },
  richListMarker: { width: 14, fontSize: 9, lineHeight: 1.35 },
  richListText: { flex: 1, fontSize: 9, textAlign: "justify", lineHeight: 1.35 },
  richTable: { borderWidth: 1, borderColor: INK, marginVertical: 8 },
  richTableRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: INK },
  richTableRowLast: { borderBottomWidth: 0 },
  richTableCell: { flex: 1, padding: 4, fontSize: 8.5, borderRightWidth: 1, borderColor: INK },
  richTableCellLast: { borderRightWidth: 0 },
  richTableHeaderCell: { fontFamily: "Helvetica-Bold" },

  and: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11, marginVertical: 8 },
  clauseHead: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginTop: 8, marginBottom: 2, lineHeight: 1.35 },
  clauseIntro: { fontSize: 9, marginBottom: 2, textAlign: "justify", lineHeight: 1.35 },
  subheading: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginTop: 8, marginBottom: 2, textDecoration: "underline", lineHeight: 1.35 },
  paragraph: { fontSize: 9, marginBottom: 4, textAlign: "justify", lineHeight: 1.35 },
  bulletRow: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 10, fontSize: 9, lineHeight: 1.35 },
  bulletText: { flex: 1, fontSize: 9, textAlign: "justify", lineHeight: 1.35 },

  signGrid: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
  signCol: { width: "45%" },
  signLine: { borderBottomWidth: 1, borderColor: INK, height: 26, justifyContent: "flex-end" },
  signImg: { position: "absolute", width: 56, height: 70.3, top: -30, left: 34 },
  signCaption: { fontFamily: "Helvetica-Bold", fontSize: 8, marginTop: 3 },
  signNameLine: { borderBottomWidth: 1, borderColor: INK, height: 20, marginTop: 16, justifyContent: "flex-end", alignItems: "center" },
  signNameText: { fontSize: 9 },
  signNameCaption: { fontSize: 7.5, color: INK_SOFT, marginTop: 2, textAlign: "center" },
});

export type AgreementPdfData = {
  destinationLabel: string;
  officeLine: string;
  blocks: AgreementBlock[];
  student: {
    fullName: string;
    dob: string | null;
    email: string | null;
    address: string | null;
    mobile: string | null;
    home: string | null;
    currentEducation: string | null;
    courseOfInterest: string | null;
    emergencyContactName: string | null;
    emergencyContactRelation: string | null;
    emergencyContactNumber: string | null;
  };
  fee: {
    currencySymbol: string;
    adminCharge: number;
    consultancyFee: number;
    discount: number | null;
    total: number;
  };
  agreementDate: string;
  signatureDataUri: string | null;
  signatoryName: string | null;
};

export function money(symbol: string, n: number) {
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Header() {
  return (
    <View style={styles.header} fixed>
      <View style={styles.brand}>
        <Image src={BRAND_LOGO_DATA_URI} style={styles.brandLogo} />
      </View>
      <Text style={styles.headerTitle}>HMARK Consultants{"\n"}Retainer Agreement</Text>
      <Text style={styles.headerPage} render={({ pageNumber }) => `${pageNumber}`} fixed />
    </View>
  );
}

function Footer({ date, signatureDataUri }: { date: string; signatureDataUri: string | null }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerDate}>{date}</Text>
      <View style={styles.sigBox}>
        <Text style={styles.sigBoxLabel}>Signature</Text>
        <View style={styles.sigBoxCells}>
          <View style={styles.sigBoxCell} />
          <View style={[styles.sigBoxCell, styles.sigBoxCellDivider]}>
            {signatureDataUri && <Image src={signatureDataUri} style={styles.sigBoxImg} />}
          </View>
        </View>
      </View>
    </View>
  );
}

function StudentDetailsChart({ student, destinationLabel }: { student: AgreementPdfData["student"]; destinationLabel: string }) {
  return (
    <View style={styles.table}>
      <View style={styles.tRow}>
        <Text style={styles.tCell}><Text style={styles.tLabel}>Name: </Text>{student.fullName}</Text>
        <Text style={styles.tCell}><Text style={styles.tLabel}>DOB: </Text>{student.dob ?? ""}</Text>
        <Text style={[styles.tCell, styles.tCellLast]}><Text style={styles.tLabel}>Email: </Text>{student.email ?? ""}</Text>
      </View>
      <View style={styles.tRow}>
        <Text style={styles.tCellFull}><Text style={styles.tLabel}>Address: </Text>{student.address ?? ""}</Text>
      </View>
      <View style={styles.tRow}>
        <Text style={styles.tCell}><Text style={styles.tLabel}>Mobile: </Text>{student.mobile ?? ""}</Text>
        <Text style={[styles.tCell, styles.tCellLast]}><Text style={styles.tLabel}>Home: </Text>{student.home ?? ""}</Text>
      </View>
      <View style={styles.tRow}>
        <Text style={styles.tCell}><Text style={styles.tLabel}>Emergency Contact: </Text>{student.emergencyContactName ?? ""}</Text>
        <Text style={styles.tCell}><Text style={styles.tLabel}>Relation: </Text>{student.emergencyContactRelation ?? ""}</Text>
        <Text style={[styles.tCell, styles.tCellLast]}><Text style={styles.tLabel}>Contact Number: </Text>{student.emergencyContactNumber ?? ""}</Text>
      </View>
      <View style={styles.tRow}>
        <Text style={styles.tCell}><Text style={styles.tLabel}>Current Education: </Text>{student.currentEducation ?? ""}</Text>
        <Text style={styles.tCell}><Text style={styles.tLabel}>University (Applying): </Text>{destinationLabel}</Text>
        <Text style={[styles.tCell, styles.tCellLast]}><Text style={styles.tLabel}>Course of Interest: </Text>{student.courseOfInterest ?? ""}</Text>
      </View>
    </View>
  );
}

function FeeTable({ fee }: { fee: AgreementPdfData["fee"] }) {
  const rows: [string, number][] = [
    ["Total Professional Fee", fee.total],
    ["Administrative fee", fee.adminCharge],
    ["Consultancy fee", fee.consultancyFee],
  ];
  if (fee.discount && fee.discount > 0) rows.push(["Discount", fee.discount]);

  return (
    <View style={styles.feeTable}>
      {rows.map(([label, value], i) => (
        <View key={label} style={[styles.feeRow, i === rows.length - 1 ? styles.feeRowLast : {}]}>
          <Text style={styles.feeLabel}>{label}</Text>
          <Text style={styles.feeValue}>{money(fee.currencySymbol, value)}</Text>
        </View>
      ))}
    </View>
  );
}

function runFontFamily(run: TextRun) {
  if (run.bold && run.italic) return "Times-BoldItalic";
  if (run.bold) return "Times-Bold";
  if (run.italic) return "Times-Italic";
  return undefined;
}

// Renders a rich-text run array (bold/italic/underline preserved from the
// builder's HTML wording) as nested inline <Text> spans within one parent.
function RichRuns({ runs }: { runs: TextRun[] }) {
  return (
    <>
      {runs.map((run, i) => (
        <Text
          key={i}
          style={{
            fontFamily: runFontFamily(run),
            textDecoration: run.underline ? "underline" : undefined,
          }}
        >
          {run.text}
        </Text>
      ))}
    </>
  );
}

function Block({ block, fee }: { block: AgreementBlock; fee: AgreementPdfData["fee"] }) {
  switch (block.kind) {
    case "clause":
      return (
        <View>
          <Text style={styles.clauseHead}>
            {block.number} {block.heading}
          </Text>
          {block.intro &&
            block.intro.split("\n").map((line, i) => (
              <Text key={i} style={styles.clauseIntro}>
                {line}
              </Text>
            ))}
        </View>
      );
    case "heading":
      return (
        <View>
          <Text style={styles.clauseHead}>{block.heading}</Text>
          {block.intro &&
            block.intro.split("\n").map((line, i) => (
              <Text key={i} style={styles.clauseIntro}>
                {line}
              </Text>
            ))}
        </View>
      );
    case "subheading":
      return <Text style={styles.subheading}>{block.text}</Text>;
    case "paragraph":
      return <Text style={styles.paragraph}>{block.text}</Text>;
    case "bullet":
      return (
        <View style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{block.text}</Text>
        </View>
      );
    case "feeTable":
      return <FeeTable fee={fee} />;
    case "richHeading": {
      const style = block.level === 1 ? styles.richHeading1 : block.level === 2 ? styles.richHeading2 : styles.richHeading3;
      return (
        <Text style={style}>
          <RichRuns runs={block.runs} />
        </Text>
      );
    }
    case "richParagraph":
      return (
        <Text style={styles.richParagraph}>
          <RichRuns runs={block.runs} />
        </Text>
      );
    case "richList":
      return (
        <View>
          {block.items.map((runs, i) => (
            <View key={i} style={styles.richListItemRow}>
              <Text style={styles.richListMarker}>{block.ordered ? `${i + 1}.` : "•"}</Text>
              <Text style={styles.richListText}>
                <RichRuns runs={runs} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "richTable":
      return (
        <View style={styles.richTable}>
          {block.rows.map((row, ri) => (
            <View key={ri} style={ri === block.rows.length - 1 ? [styles.richTableRow, styles.richTableRowLast] : styles.richTableRow}>
              {row.cells.map((cellRuns, ci) => (
                <Text
                  key={ci}
                  style={[
                    styles.richTableCell,
                    ci === row.cells.length - 1 ? styles.richTableCellLast : {},
                    row.header ? styles.richTableHeaderCell : {},
                  ]}
                >
                  <RichRuns runs={cellRuns} />
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    default:
      return null;
  }
}

export function AgreementDocument({ data }: { data: AgreementPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header />

        <StudentDetailsChart student={data.student} destinationLabel={data.destinationLabel} />
        <Text style={styles.and}>AND</Text>

        <Text style={styles.paragraph}>{data.officeLine}</Text>

        {data.blocks.map((block, i) =>
          i === data.blocks.length - 1 ? (
            <View key={i} minPresenceAhead={150}>
              <Block block={block} fee={data.fee} />
            </View>
          ) : (
            <Block key={i} block={block} fee={data.fee} />
          )
        )}

        <View style={styles.signGrid}>
          <View style={styles.signCol}>
            <View style={styles.signLine} />
            <Text style={styles.signCaption}>(Signature) Client</Text>
            <View style={styles.signNameLine}>
              <Text style={styles.signNameText}>{data.student.fullName}</Text>
            </View>
            <Text style={styles.signNameCaption}>[Client Name]</Text>
          </View>
          <View style={styles.signCol}>
            <View style={styles.signLine}>{data.signatureDataUri && <Image src={data.signatureDataUri} style={styles.signImg} />}</View>
            <Text style={styles.signCaption}>(Signature) HMARK Consultants</Text>
            <View style={styles.signNameLine}>
              <Text style={styles.signNameText}>{data.signatoryName ?? ""}</Text>
            </View>
            <Text style={styles.signNameCaption}>[Consultant Full Name]</Text>
          </View>
        </View>

        <Footer date={data.agreementDate} signatureDataUri={data.signatureDataUri} />
      </Page>
    </Document>
  );
}
