import path from "node:path";
import { Document, Page, Text, View, Image, StyleSheet, Font, Svg, Path, Polygon, type Styles } from "@react-pdf/renderer";
import type { AgreementBlock, BlockFormat, RichCell, RichListItem, TextRun } from "./agreementContent";
import { BRAND_LOGO_DATA_URI, BRAND_LOGO_RATIO } from "./brandLogo";
import {
  FONT_CHOICES,
  fontFile,
  formatAmount,
  formatListNumber,
  themedFeeRows,
  type BulletShape,
  type HeadingStyle,
  type NumberFormat,
  type Theme,
} from "./agreementTheme";

type Style = Styles[string];

// The builder's fonts, from the same files the editor shows them in. Only read
// when a document uses one, so a Classic agreement never touches them. The
// files reach the server functions through outputFileTracingIncludes
// (next.config.ts).
const FONT_DIR = path.join(process.cwd(), "public", "fonts", "agreement");
for (const choice of FONT_CHOICES) {
  Font.register({
    family: choice.key,
    fonts: [false, true].flatMap((bold) =>
      [false, true].map((italic) => ({
        src: path.join(FONT_DIR, fontFile(choice, bold, italic)),
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? ("italic" as const) : ("normal" as const),
      }))
    ),
  });
}

// Word does not hyphenate, and a themed template is meant to read like the
// Word document it came from. Classic keeps react-pdf's own hyphenation, as it
// always has.
const WHOLE_WORDS = (word: string) => [word];

// Nor does it join letters into ligatures, and the PDF cannot map a ligature
// back to its letters: with them on, copying "office" out of the agreement
// gives "ofce". Inherited, so set once on the page or the run.
const NO_LIGATURES = { liga: false, clig: false };

// Points of left margin per builder Increase-Indent level / list nesting
// depth — a design choice (there's no pixel-for-pixel need to match the
// editor's own 24px-per-level CSS), just enough to read clearly as nested.
const INDENT_UNIT_PT = 14;

/** Room a heading needs below it on the page — about three lines of body text — or it moves on with them. */
const HEADING_KEEP_WITH_NEXT_PT = 40;
// Matches Word's convention of alternating bullet glyphs per nesting depth
// (solid disc, then hollow circle, then square) instead of repeating the
// same dot at every level.
const BULLET_GLYPHS = ["•", "◦", "▪"];

const GREEN = "#146856";
const INK = "#1B2420";
const INK_SOFT = "#4A544E";
const RULE = "#B8B6A9";

// The Classic look: every agreement printed like this before templates could
// be styled, and a template with no design still does. Leave these alone —
// changing one restyles every agreement already issued the next time its PDF
// is regenerated. A themed template is drawn from its Theme instead.
const styles = StyleSheet.create({
  // paddingBottom clears the fixed footer: it sits 28pt up and its signature
  // box is ~58pt tall, so it reaches ~86pt from the bottom edge. At 70 the box
  // was drawn over the last lines of every full page.
  page: { paddingTop: 40, paddingBottom: 96, paddingHorizontal: 44, fontSize: 9, color: INK, fontFamily: "Times-Roman" },

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
  sigBoxImg: { position: "absolute", width: 80, height: 100.5, top: -28, left: 15 },

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
  feeLabelNote: { fontSize: 7.5, fontFamily: "Helvetica" },
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
  /** Header and signature caption; Company details (0288). */
  companyName?: string;
  blocks: AgreementBlock[];
  student: {
    fullName: string;
    dob: string | null;
    email: string | null;
    address: string | null;
    mobile: string | null;
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
    installmentAmounts: number[];
    discount: number | null;
    total: number;
    // A backup-country agreement (a destination the student added as a
    // hedge, not their main pick — see PrimaryBackupDestinationSelect)
    // charges only that destination's administrative fee, so its fee table
    // has no consultancy/installment rows and labels the admin fee with the
    // country name instead of the generic heading a primary agreement uses.
    isBackup: boolean;
    destinationLabel: string;
    /**
     * A visa documentation and application agreement (0279): no
     * administrative charge and no consultancy fee — the visa service fee,
     * carried in consultancyFee and installmentAmounts, is the whole of it.
     */
    isVisaOnly?: boolean;
  };
  agreementDate: string;
  signatureDataUri: string | null;
  signatoryName: string | null;
  /** The template's design; absent or null prints the Classic look. */
  theme?: Theme | null;
};

export function money(symbol: string, n: number) {
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ------------------------------------------------------------ themed styles
//
// A themed template's look, computed from its Theme. The page furniture —
// letterhead, details chart, signature block, footer — keeps the Classic
// layout and takes the theme's fonts and colours.

const BOLD = 700;

function headingText(h: HeadingStyle): Style {
  return {
    fontFamily: h.font,
    fontSize: h.size,
    color: h.color,
    fontWeight: h.bold ? BOLD : 400,
    fontStyle: h.italic ? "italic" : "normal",
    lineHeight: 1.22,
  };
}

function bodyText(t: Theme): Style {
  return { fontSize: t.body.size, lineHeight: t.body.lineHeight, textAlign: t.body.align, color: t.body.color };
}

// The builder's paragraph options that sit on the text itself.
function formatText(f: BlockFormat | undefined): Style {
  if (!f) return {};
  const s: Style = {};
  if (f.align) s.textAlign = f.align;
  if (f.lineHeight) s.lineHeight = f.lineHeight;
  if (f.spaceBefore !== undefined) s.marginTop = f.spaceBefore;
  if (f.spaceAfter !== undefined) s.marginBottom = f.spaceAfter;
  return s;
}

/**
 * A paragraph or heading with a rule under it or a shade behind it: the text
 * goes in a box that carries them, and the text's own spacing moves to the box
 * so the rule sits under the text rather than under its spacing.
 */
function Framed({
  rule,
  shade,
  textStyle,
  keepWithNext,
  wholeWords,
  children,
}: {
  rule?: string | null;
  shade?: string | null;
  textStyle: Style[];
  keepWithNext?: boolean;
  wholeWords?: boolean;
  children: React.ReactNode;
}) {
  const merged: Style = Object.assign({}, ...textStyle);
  const { marginTop, marginBottom, marginLeft, ...rest } = merged;
  return (
    <View
      minPresenceAhead={keepWithNext ? HEADING_KEEP_WITH_NEXT_PT : undefined}
      style={{
        marginTop,
        marginBottom,
        marginLeft,
        ...(rule ? { borderBottomWidth: 0.75, borderBottomColor: rule, paddingBottom: 1.5 } : {}),
        ...(shade ? { backgroundColor: shade, paddingHorizontal: 4, paddingVertical: 2 } : {}),
      }}
    >
      <Text hyphenationCallback={wholeWords ? WHOLE_WORDS : undefined} style={rest}>
        {children}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------ letterhead and footer

// The company's name comes from Setup → Agreement templates → Company details
// (0288); the default is what every agreement said before that existed.
const COMPANY_NAME = "HMARK Consultants";

function Header({
  title = "Retainer Agreement",
  theme,
  companyName = COMPANY_NAME,
}: {
  title?: string;
  theme?: Theme | null;
  companyName?: string;
}) {
  if (!theme) {
    return (
      <View style={styles.header} fixed>
        <View style={styles.brand}>
          <Image src={BRAND_LOGO_DATA_URI} style={styles.brandLogo} />
        </View>
        <Text style={styles.headerTitle}>{companyName}{"\n"}{title}</Text>
        <Text style={styles.headerPage} render={({ pageNumber }) => `${pageNumber}`} fixed />
      </View>
    );
  }
  const h = theme.header;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingBottom: 6,
        marginBottom: 12,
        ...(h.ruleWidth > 0 ? { borderBottomWidth: h.ruleWidth, borderBottomColor: h.ruleColor } : {}),
      }}
      fixed
    >
      <View style={styles.brand}>
        <Image src={BRAND_LOGO_DATA_URI} style={{ height: 30, width: 30 * BRAND_LOGO_RATIO }} />
      </View>
      <Text style={{ textAlign: "right", fontFamily: theme.body.font, fontSize: h.titleSize, color: h.titleColor, marginRight: 10, lineHeight: 1.22 }}>
        {companyName}
        {"\n"}
        {title}
      </Text>
      <Text
        style={{
          minWidth: h.pageNumberSize * 1.4,
          textAlign: "center",
          fontFamily: theme.body.font,
          fontSize: h.pageNumberSize,
          color: h.pageNumberColor,
          borderLeftWidth: Math.max(1, h.ruleWidth * 0.75),
          borderLeftColor: h.ruleColor,
          paddingLeft: 8,
        }}
        render={({ pageNumber }) => `${pageNumber}`}
        fixed
      />
    </View>
  );
}

function Footer({ date, signatureDataUri, theme }: { date: string; signatureDataUri: string | null; theme?: Theme | null }) {
  const m = theme?.page.margin;
  const ink = theme?.body.color ?? INK;
  return (
    <View style={[styles.footer, m !== undefined ? { left: m, right: m } : {}]} fixed>
      <Text style={theme ? { fontSize: 11, color: theme.body.color, fontFamily: theme.body.font } : styles.footerDate}>{date}</Text>
      <View style={[styles.sigBox, theme ? { borderColor: ink } : {}]}>
        <Text
          style={[
            styles.sigBoxLabel,
            theme ? { fontFamily: theme.body.font, fontWeight: BOLD, fontSize: 8.5, color: ink, borderBottomColor: ink } : {},
          ]}
        >
          Signature
        </Text>
        <View style={styles.sigBoxCells}>
          <View style={styles.sigBoxCell} />
          <View style={[styles.sigBoxCell, styles.sigBoxCellDivider, theme ? { borderLeftColor: ink } : {}]}>
            {signatureDataUri && <Image src={signatureDataUri} style={styles.sigBoxImg} />}
          </View>
        </View>
      </View>
    </View>
  );
}

// ------------------------------------------------------------ the details chart

// The value is a node rather than a string so the emergency contact keeps the
// three separate pieces of text it has always been drawn as.
type ChartCell = { label: string; value: React.ReactNode; full?: boolean };

// The chart at the top of every agreement — Classic in its own fixed styles,
// themed in the theme's font and table colour.
function DetailsChart({ rows, theme }: { rows: ChartCell[][]; theme?: Theme | null }) {
  if (!theme) {
    return (
      <View style={styles.table}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.tRow}>
            {row.map((c, ci) => (
              <Text key={ci} style={c.full ? styles.tCellFull : ci === row.length - 1 ? [styles.tCell, styles.tCellLast] : styles.tCell}>
                <Text style={styles.tLabel}>{`${c.label}: `}</Text>
                {c.value}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }
  const border = theme.table.border;
  const cell: Style = { flex: 1, borderBottomWidth: 0.5, borderColor: border, paddingVertical: 3, paddingHorizontal: 5, fontSize: Math.max(7, theme.body.size - 1), lineHeight: 1.22 };
  return (
    <View style={{ borderWidth: 0.5, borderBottomWidth: 0, borderColor: border, marginBottom: 10 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row" }}>
          {row.map((c, ci) => (
            <Text key={ci} hyphenationCallback={WHOLE_WORDS} style={[cell, ci < row.length - 1 ? { borderRightWidth: 0.5 } : {}]}>
              <Text style={{ fontWeight: BOLD }}>{`${c.label}: `}</Text>
              {c.value}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function StudentDetailsChart({ student, destinationLabel, theme }: { student: AgreementPdfData["student"]; destinationLabel: string; theme?: Theme | null }) {
  const emergency = (
    <>
      {student.emergencyContactName ?? ""}
      {student.emergencyContactRelation ? ` (${student.emergencyContactRelation})` : ""}
      {student.emergencyContactNumber ? ` — ${student.emergencyContactNumber}` : ""}
    </>
  );
  return (
    <DetailsChart
      theme={theme}
      rows={[
        [
          { label: "Name", value: student.fullName },
          { label: "DOB", value: student.dob ?? "" },
          { label: "Email", value: student.email ?? "" },
        ],
        [{ label: "Address", value: student.address ?? "", full: true }],
        [
          { label: "Mobile", value: student.mobile ?? "" },
          { label: "Emergency Contact", value: emergency },
        ],
        [
          { label: "Current Education", value: student.currentEducation ?? "" },
          { label: "University (Applying)", value: destinationLabel },
          { label: "Course of Interest", value: student.courseOfInterest ?? "" },
        ],
      ]}
    />
  );
}

// ------------------------------------------------------------ the payment chart

// Each installment's due point is fixed by its position in the business's
// payment schedule: 1st at signing, 2nd the following month, 3rd on
// acceptance from the first university.
const INSTALLMENT_SCHEDULE: { label: string; note: string }[] = [
  { label: "First Installment", note: "Pay at the time of signing the agreement" },
  { label: "Second Installment", note: "Pay in the next month" },
  { label: "Third Installment", note: "Pay at the time of acceptance from the first university" },
];

// The administrative fee is a single flat, non-refundable charge — only the
// consultancy fee (and any discount, which only ever applies to the
// consultancy fee, never the admin charge) is split into the staff-chosen
// number of installments (agreements.installment_count, 1-3), matching the
// invoice module's installment-count dropdown (see generateInvoice in
// src/lib/actions/invoices.ts). Row order and due-date notes follow the
// business's fixed payment schedule: admin charge and the first installment
// at signing, further installments later, with the grand total shown last.
// There's deliberately no separate "Discount" row: each installment amount
// passed in is already net of the discount (see generateAgreementPdf), so a
// standalone discount line would make the rows overshoot the stated total by
// double-counting it — the discount is called out as a note on the total
// instead, which keeps every row adding up correctly.
function FeeTable({ fee, theme }: { fee: AgreementPdfData["fee"]; theme?: Theme | null }) {
  if (theme) return <ThemedFeeTable fee={fee} theme={theme} />;
  if (fee.isVisaOnly) return <VisaServiceFeeTable fee={fee} />;
  const rows: { label: string; note?: string; value: number }[] = [
    {
      label: fee.isBackup ? `Administrative Fee (${fee.destinationLabel})` : "Administrative Charges (Non-Refundable)",
      note: "Pay at the time of signing the agreement",
      value: fee.adminCharge,
    },
  ];
  if (!fee.isBackup) {
    if (fee.installmentAmounts.length <= 1) {
      rows.push({ label: "Consultancy Fee", value: fee.installmentAmounts[0] ?? fee.consultancyFee });
    } else {
      fee.installmentAmounts.forEach((amount, i) => {
        const schedule = INSTALLMENT_SCHEDULE[i] ?? { label: `Installment ${i + 1}`, note: undefined };
        rows.push({ label: schedule.label, note: schedule.note, value: amount });
      });
    }
  }
  rows.push({
    label: "Total Professional Fee",
    note: fee.discount && fee.discount > 0 ? `Includes a discount of ${money(fee.currencySymbol, fee.discount)}, already applied above` : undefined,
    value: fee.total,
  });

  return (
    <View style={styles.feeTable}>
      {rows.map((row, i) => (
        <View key={row.label} style={[styles.feeRow, i === rows.length - 1 ? styles.feeRowLast : {}]}>
          <Text style={styles.feeLabel}>
            {row.label}
            {row.note && <Text style={styles.feeLabelNote}>{"\n"}{row.note}</Text>}
          </Text>
          <Text style={styles.feeValue}>{money(fee.currencySymbol, row.value)}</Text>
        </View>
      ))}
    </View>
  );
}

// The payment chart as a themed template draws it: an optional header row in
// the table colours, the rows in the template's wording, amounts in its
// format, the total on its own shade. Kept on one page.
function ThemedFeeTable({ fee, theme }: { fee: AgreementPdfData["fee"]; theme: Theme }) {
  const t = theme.table;
  const rows = themedFeeRows(fee, theme.fee);
  const border = t.border;
  const cell: Style = { paddingVertical: 2.5, paddingHorizontal: 5, fontSize: theme.body.size, lineHeight: 1.22, color: theme.body.color };
  const label: Style = { ...cell, width: "76%", borderRightWidth: 0.5, borderColor: border };
  const amount: Style = { ...cell, width: "24%", textAlign: "right", fontWeight: BOLD };
  const note: Style = { fontSize: Math.max(6.5, theme.body.size - 1.5), fontWeight: 400, color: INK_SOFT };
  const headerColor = t.headerFill ? t.headerText : theme.body.color;
  return (
    <View wrap={false} style={{ borderWidth: 0.5, borderColor: border, marginTop: 4, marginBottom: 10 }}>
      {theme.fee.headerRow && (
        <View style={{ flexDirection: "row", borderBottomWidth: 0.5, borderColor: border, ...(t.headerFill ? { backgroundColor: t.headerFill } : {}) }}>
          <Text style={[label, { fontWeight: BOLD, color: headerColor }]}>{theme.fee.paymentLabel}</Text>
          <Text style={[amount, { color: headerColor }]}>{theme.fee.amountLabel}</Text>
        </View>
      )}
      {rows.map((row, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            ...(i < rows.length - 1 ? { borderBottomWidth: 0.5, borderColor: border } : {}),
            ...(row.total && t.totalFill ? { backgroundColor: t.totalFill } : {}),
          }}
        >
          <Text hyphenationCallback={WHOLE_WORDS} style={[label, row.total ? { fontWeight: BOLD } : {}]}>
            {row.label}
            {row.note && <Text style={note}>{"\n"}{row.note}</Text>}
          </Text>
          <Text style={amount}>{formatAmount(fee.currencySymbol, row.value, theme.fee.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------ runs

function runFontFamily(run: TextRun) {
  if (run.bold && run.italic) return "Times-BoldItalic";
  if (run.bold) return "Times-Bold";
  if (run.italic) return "Times-Italic";
  return undefined;
}

function decoration(run: TextRun): Style["textDecoration"] {
  if (run.underline && run.strike) return "underline line-through";
  if (run.underline) return "underline";
  if (run.strike) return "line-through";
  return undefined;
}

/**
 * One run's style. A Classic run with nothing but bold/italic/underline is
 * exactly the style it always had — Times by weight, underline or not — and
 * the builder's font, size, colour and highlight only add to it. Under a
 * theme, weight and slant go on the paragraph's own font, which the run
 * inherits unless it names one. `bold` is whether the run's container is
 * already bold (a Classic heading, a header cell), which a run in a font of
 * its own has to say explicitly.
 */
function runStyle(run: TextRun, themed: boolean, bold: boolean): Style {
  let s: Style;
  if (!themed && !run.font) {
    s = { fontFamily: runFontFamily(run), textDecoration: run.underline ? "underline" : undefined };
    if (run.strike) s.textDecoration = decoration(run);
  } else if (!themed) {
    s = {
      fontFamily: run.font,
      fontWeight: run.bold || bold ? BOLD : 400,
      fontStyle: run.italic ? "italic" : "normal",
      textDecoration: decoration(run),
      fontFeatureSettings: NO_LIGATURES,
    };
  } else {
    s = { textDecoration: decoration(run) };
    if (run.font) s.fontFamily = run.font;
    if (run.bold) s.fontWeight = BOLD;
    if (run.italic) s.fontStyle = "italic";
  }
  if (run.size) s.fontSize = run.size;
  if (run.color) s.color = run.color;
  if (run.highlight) s.backgroundColor = run.highlight;
  return s;
}

// Renders a rich-text run array (bold/italic/underline preserved from the
// builder's HTML wording) as nested inline <Text> spans within one parent.
function RichRuns({ runs, themed = false, bold = false }: { runs: TextRun[]; themed?: boolean; bold?: boolean }) {
  return (
    <>
      {runs.map((run, i) => (
        <Text key={i} style={runStyle(run, themed, bold)}>
          {run.text}
        </Text>
      ))}
    </>
  );
}

// ------------------------------------------------------------ list markers

/**
 * A bullet drawn rather than typed: a glyph like ▪ is missing from the PDF's
 * standard fonts and sits at a different height in every other one, where a
 * shape is the same size, colour and position in any font.
 */
function Marker({ shape, color, fontSize, lineHeight }: { shape: BulletShape; color: string; fontSize: number; lineHeight: number }) {
  const s = fontSize * 0.36;
  let mark: React.ReactNode;
  switch (shape) {
    case "disc":
      mark = <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: color }} />;
      break;
    case "circle":
      mark = <View style={{ width: s * 1.05, height: s * 1.05, borderRadius: s, borderWidth: 0.8, borderColor: color }} />;
      break;
    case "diamond":
      mark = <View style={{ width: s * 0.9, height: s * 0.9, backgroundColor: color, transform: "rotate(45deg)" }} />;
      break;
    case "dash":
      mark = <View style={{ width: fontSize * 0.45, height: Math.max(0.6, fontSize * 0.08), backgroundColor: color }} />;
      break;
    case "arrow":
      mark = (
        <Svg width={s * 1.4} height={s * 1.4} viewBox="0 0 10 10">
          <Polygon points="1,0.5 9.5,5 1,9.5 3,5" fill={color} />
        </Svg>
      );
      break;
    case "check":
      mark = (
        <Svg width={s * 1.6} height={s * 1.6} viewBox="0 0 10 10">
          <Path d="M1.2 5.4 L3.9 8.1 L8.8 1.8" stroke={color} strokeWidth={1.5} fill="none" />
        </Svg>
      );
      break;
    default:
      mark = <View style={{ width: s, height: s, backgroundColor: color }} />;
  }
  return <View style={{ height: fontSize * lineHeight, justifyContent: "center" }}>{mark}</View>;
}

function ListItemRow({ item, theme, index }: { item: RichListItem; theme?: Theme | null; index: number }) {
  if (!theme) {
    // Classic: a typed glyph or number, unless the builder chose a bullet,
    // numbering or colour for this list.
    const custom = item.bullet || item.numbering || item.markerColor;
    return (
      <View style={[styles.richListItemRow, { marginLeft: item.indent * INDENT_UNIT_PT }]}>
        {!custom ? (
          <Text style={styles.richListMarker}>{item.ordered ? `${item.number ?? index + 1}.` : BULLET_GLYPHS[item.indent % BULLET_GLYPHS.length]}</Text>
        ) : item.ordered ? (
          <Text style={[styles.richListMarker, item.markerColor ? { color: item.markerColor } : {}]}>
            {formatListNumber(item.number ?? index + 1, item.numbering)}
          </Text>
        ) : (
          <View style={{ width: 14 }}>
            <Marker shape={item.bullet ?? "disc"} color={item.markerColor ?? INK} fontSize={9} lineHeight={1.35} />
          </View>
        )}
        <Text style={[styles.richListText, formatText(item.format)]}>
          <RichRuns runs={item.runs} />
        </Text>
      </View>
    );
  }
  const body = theme.body;
  const lineHeight = item.format?.lineHeight ?? body.lineHeight;
  const color = item.markerColor ?? theme.list.color;
  const numbering: NumberFormat = item.numbering ?? theme.list.numbering;
  return (
    // Kept whole, as Word's "keep lines together" keeps the reference contract's
    // items: split across a page, the marker stayed behind on the first page.
    <View wrap={false} style={{ flexDirection: "row", marginBottom: theme.list.spaceAfter, marginLeft: 4.5 + item.indent * 18 }}>
      <View style={{ width: item.ordered ? Math.max(13.5, body.size * 1.6) : 13.5 }}>
        {item.ordered ? (
          <Text style={{ fontSize: body.size, lineHeight, color }}>{formatListNumber(item.number ?? index + 1, numbering)}</Text>
        ) : (
          <Marker shape={item.bullet ?? theme.list.bullet} color={color} fontSize={body.size} lineHeight={lineHeight} />
        )}
      </View>
      <Text hyphenationCallback={WHOLE_WORDS} style={[{ flex: 1 }, bodyText(theme), formatText(item.format)]}>
        <RichRuns runs={item.runs} themed />
      </Text>
    </View>
  );
}

// ------------------------------------------------------------ tables

function cellWidth(widths: number[] | undefined, col: number, span: number): Style {
  if (!widths) return span > 1 ? { flex: span } : {};
  const share = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
  return { flexGrow: 0, flexShrink: 0, flexBasis: `${Math.round(share * 10000) / 100}%` };
}

function RichTable({ block, theme }: { block: Extract<AgreementBlock, { kind: "richTable" }>; theme?: Theme | null }) {
  const border = block.border ?? theme?.table.border;
  const columnsOf = (cells: RichCell[]) => {
    let col = 0;
    return cells.map((cell) => {
      const at = col;
      col += cell.colspan ?? 1;
      return at;
    });
  };
  if (!theme) {
    return (
      <View style={[styles.richTable, border ? { borderColor: border } : {}]}>
        {block.rows.map((row, ri) => {
          const cols = columnsOf(row.cells);
          return (
            <View
              key={ri}
              style={[
                ri === block.rows.length - 1 ? [styles.richTableRow, styles.richTableRowLast] : styles.richTableRow,
                border ? { borderColor: border } : {},
              ].flat()}
            >
              {row.cells.map((cell, ci) => (
                <Text
                  key={ci}
                  style={[
                    styles.richTableCell,
                    ci === row.cells.length - 1 ? styles.richTableCellLast : {},
                    row.header ? styles.richTableHeaderCell : {},
                    ...(cell.align || cell.fill || cell.colspan || block.widths || border
                      ? [
                          {
                            ...cellWidth(block.widths, cols[ci], cell.colspan ?? 1),
                            ...(cell.align ? { textAlign: cell.align } : {}),
                            ...(cell.fill ? { backgroundColor: cell.fill } : {}),
                            ...(border ? { borderColor: border } : {}),
                          },
                        ]
                      : []),
                  ]}
                >
                  <RichRuns runs={cell.runs} bold={row.header} />
                </Text>
              ))}
            </View>
          );
        })}
      </View>
    );
  }
  const t = theme.table;
  const lineColor = border ?? t.border;
  return (
    <View style={{ borderWidth: 0.5, borderColor: lineColor, marginTop: 4, marginBottom: 10 }}>
      {block.rows.map((row, ri) => {
        const cols = columnsOf(row.cells);
        return (
          <View
            key={ri}
            wrap={false}
            style={{ flexDirection: "row", ...(ri < block.rows.length - 1 ? { borderBottomWidth: 0.5, borderColor: lineColor } : {}) }}
          >
            {row.cells.map((cell, ci) => {
              const fill = cell.fill ?? (row.header ? t.headerFill : null);
              return (
                <Text
                  key={ci}
                  hyphenationCallback={WHOLE_WORDS}
                  style={{
                    flex: 1,
                    ...cellWidth(block.widths, cols[ci], cell.colspan ?? 1),
                    paddingVertical: 2.5,
                    paddingHorizontal: 5,
                    fontSize: theme.body.size,
                    lineHeight: 1.22,
                    color: row.header && t.headerFill ? t.headerText : theme.body.color,
                    ...(row.header ? { fontWeight: BOLD } : {}),
                    ...(ci < row.cells.length - 1 ? { borderRightWidth: 0.5, borderColor: lineColor } : {}),
                    ...(fill ? { backgroundColor: fill } : {}),
                    ...(cell.align ? { textAlign: cell.align } : {}),
                  }}
                >
                  <RichRuns runs={cell.runs} themed />
                </Text>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------ blocks

function ClassicBlock({ block, fee }: { block: AgreementBlock; fee: AgreementPdfData["fee"] }) {
  switch (block.kind) {
    case "clause":
      return (
        <View>
          <Text minPresenceAhead={HEADING_KEEP_WITH_NEXT_PT} style={styles.clauseHead}>
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
          <Text minPresenceAhead={HEADING_KEEP_WITH_NEXT_PT} style={styles.clauseHead}>{block.heading}</Text>
          {block.intro &&
            block.intro.split("\n").map((line, i) => (
              <Text key={i} style={styles.clauseIntro}>
                {line}
              </Text>
            ))}
        </View>
      );
    case "subheading":
      return (
        <Text minPresenceAhead={HEADING_KEEP_WITH_NEXT_PT} style={styles.subheading}>
          {block.text}
        </Text>
      );
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
      const indent = block.indent ? { marginLeft: block.indent * INDENT_UNIT_PT } : {};
      if (block.format?.rule || block.format?.shade) {
        return (
          <Framed rule={block.format.rule} shade={block.format.shade} textStyle={[style, indent, formatText(block.format)]} keepWithNext>
            <RichRuns runs={block.runs} bold />
          </Framed>
        );
      }
      return (
        // minPresenceAhead: a heading needs room for a few lines of what it
        // heads, or it goes to the next page with them — otherwise a clause
        // title can end one page and its text begin the next.
        <Text minPresenceAhead={HEADING_KEEP_WITH_NEXT_PT} style={block.format ? [style, indent, formatText(block.format)] : [style, indent]}>
          <RichRuns runs={block.runs} bold />
        </Text>
      );
    }
    case "richParagraph": {
      const indent = block.indent ? { marginLeft: block.indent * INDENT_UNIT_PT } : {};
      if (block.format?.rule || block.format?.shade) {
        return (
          <Framed rule={block.format.rule} shade={block.format.shade} textStyle={[styles.richParagraph, indent, formatText(block.format)]}>
            <RichRuns runs={block.runs} />
          </Framed>
        );
      }
      return (
        <Text style={block.format ? [styles.richParagraph, indent, formatText(block.format)] : [styles.richParagraph, indent]}>
          <RichRuns runs={block.runs} />
        </Text>
      );
    }
    case "richList":
      return (
        <View>
          {block.items.map((item, i) => (
            <ListItemRow key={i} item={item} index={i} />
          ))}
        </View>
      );
    case "richTable":
      return <RichTable block={block} />;
    case "pageBreak":
      return <View break />;
    case "rule":
      return <View style={{ borderBottomWidth: 1, borderBottomColor: block.color ?? INK, marginVertical: 6 }} />;
    default:
      return null;
  }
}

function ThemedBlock({ block, fee, theme }: { block: AgreementBlock; fee: AgreementPdfData["fee"]; theme: Theme }) {
  const body = bodyText(theme);
  const paragraph: Style = { ...body, marginBottom: theme.body.spaceAfter };
  const heading = (level: 1 | 2 | 3) => theme.headings[level - 1];
  const headingBox = (h: HeadingStyle): Style => ({ ...headingText(h), marginTop: h.spaceBefore, marginBottom: h.spaceAfter });

  switch (block.kind) {
    // The built-in wording of a country with no wording of its own, in the theme.
    case "clause":
    case "heading": {
      const h = heading(1);
      return (
        <View>
          <Framed wholeWords rule={h.rule} textStyle={[headingBox(h)]} keepWithNext>
            {block.kind === "clause" ? `${block.number} ${block.heading}` : block.heading}
          </Framed>
          {block.intro &&
            block.intro.split("\n").map((line, i) => (
              <Text key={i} hyphenationCallback={WHOLE_WORDS} style={paragraph}>
                {line}
              </Text>
            ))}
        </View>
      );
    }
    case "subheading": {
      const h = heading(2);
      return (
        <Framed wholeWords rule={h.rule} textStyle={[headingBox(h)]} keepWithNext>
          {block.text}
        </Framed>
      );
    }
    case "paragraph":
      return (
        <Text hyphenationCallback={WHOLE_WORDS} style={paragraph}>
          {block.text}
        </Text>
      );
    case "bullet":
      return <ListItemRow item={{ runs: [{ text: block.text }], indent: 0, ordered: false }} theme={theme} index={0} />;
    case "feeTable":
      return <FeeTable fee={fee} theme={theme} />;
    case "richHeading": {
      const h = heading(block.level);
      const indent = block.indent ? { marginLeft: block.indent * INDENT_UNIT_PT } : {};
      return (
        <Framed wholeWords rule={block.format?.rule ?? h.rule} shade={block.format?.shade} textStyle={[headingBox(h), indent, formatText(block.format)]} keepWithNext>
          <RichRuns runs={block.runs} themed />
        </Framed>
      );
    }
    case "richParagraph": {
      const indent = block.indent ? { marginLeft: block.indent * INDENT_UNIT_PT } : {};
      if (block.format?.rule || block.format?.shade) {
        return (
          <Framed wholeWords rule={block.format.rule} shade={block.format.shade} textStyle={[paragraph, indent, formatText(block.format)]}>
            <RichRuns runs={block.runs} themed />
          </Framed>
        );
      }
      return (
        <Text hyphenationCallback={WHOLE_WORDS} style={[paragraph, indent, formatText(block.format)]}>
          <RichRuns runs={block.runs} themed />
        </Text>
      );
    }
    case "richList":
      return (
        <View style={{ marginBottom: Math.max(0, theme.body.spaceAfter - theme.list.spaceAfter) }}>
          {block.items.map((item, i) => (
            <ListItemRow key={i} item={item} index={i} theme={theme} />
          ))}
        </View>
      );
    case "richTable":
      return <RichTable block={block} theme={theme} />;
    case "pageBreak":
      return <View break />;
    case "rule":
      return <View style={{ borderBottomWidth: 0.75, borderBottomColor: block.color ?? theme.headings[0].rule ?? theme.table.border, marginVertical: 6 }} />;
    default:
      return null;
  }
}

function Block({ block, fee, theme }: { block: AgreementBlock; fee: AgreementPdfData["fee"]; theme?: Theme | null }) {
  return theme ? <ThemedBlock block={block} fee={fee} theme={theme} /> : <ClassicBlock block={block} fee={fee} />;
}

// ------------------------------------------------------------ the page furniture shared by both documents

function Blocks({ blocks, fee, theme }: { blocks: AgreementBlock[]; fee: AgreementPdfData["fee"]; theme?: Theme | null }) {
  return (
    <>
      {blocks.map((block, i) =>
        i === blocks.length - 1 ? (
          <View key={i} minPresenceAhead={150}>
            <Block block={block} fee={fee} theme={theme} />
          </View>
        ) : (
          <Block key={i} block={block} fee={fee} theme={theme} />
        )
      )}
    </>
  );
}

function SignatureBlock({
  leftCaption,
  leftName,
  leftNameCaption,
  rightNameCaption,
  signatureDataUri,
  signatoryName,
  theme,
  companyName = COMPANY_NAME,
}: {
  leftCaption: string;
  leftName: string;
  leftNameCaption: string;
  rightNameCaption: string;
  signatureDataUri: string | null;
  signatoryName: string | null;
  theme?: Theme | null;
  companyName?: string;
}) {
  const ink = theme ? { borderColor: theme.body.color } : {};
  const caption = theme ? { fontFamily: theme.body.font, fontWeight: BOLD, fontSize: 8.5, color: theme.body.color } : {};
  const name = theme ? { fontSize: theme.body.size, color: theme.body.color } : {};
  const nameCaption = theme ? { fontFamily: theme.body.font, fontSize: 8, fontWeight: BOLD, color: theme.body.color } : {};
  return (
    <View style={styles.signGrid} wrap={theme ? false : undefined}>
      <View style={styles.signCol}>
        <View style={[styles.signLine, ink]} />
        <Text style={[styles.signCaption, caption]}>{leftCaption}</Text>
        <View style={[styles.signNameLine, ink]}>
          <Text style={[styles.signNameText, name]}>{leftName}</Text>
        </View>
        <Text style={[styles.signNameCaption, nameCaption]}>{leftNameCaption}</Text>
      </View>
      <View style={styles.signCol}>
        <View style={[styles.signLine, ink]}>{signatureDataUri && <Image src={signatureDataUri} style={styles.signImg} />}</View>
        <Text style={[styles.signCaption, caption]}>(Signature) {companyName}</Text>
        <View style={[styles.signNameLine, ink]}>
          <Text style={[styles.signNameText, name]}>{signatoryName ?? ""}</Text>
        </View>
        <Text style={[styles.signNameCaption, nameCaption]}>{rightNameCaption}</Text>
      </View>
    </View>
  );
}

function pageStyle(theme: Theme | null | undefined): Style {
  if (!theme) return styles.page;
  return {
    paddingTop: 36,
    paddingBottom: 96,
    paddingHorizontal: theme.page.margin,
    fontSize: theme.body.size,
    color: theme.body.color,
    fontFamily: theme.body.font,
    fontFeatureSettings: NO_LIGATURES,
  };
}

function AndLine({ theme }: { theme?: Theme | null }) {
  return (
    <Text style={theme ? { textAlign: "center", fontFamily: theme.body.font, fontWeight: BOLD, fontSize: theme.body.size + 1, marginVertical: 8 } : styles.and}>
      AND
    </Text>
  );
}

function OfficeLine({ text, theme }: { text: string; theme?: Theme | null }) {
  return theme ? (
    <Text hyphenationCallback={WHOLE_WORDS} style={{ ...bodyText(theme), marginBottom: theme.body.spaceAfter + 2 }}>
      {text}
    </Text>
  ) : (
    <Text style={styles.paragraph}>{text}</Text>
  );
}

export function AgreementDocument({ data }: { data: AgreementPdfData }) {
  const theme = data.theme ?? null;
  return (
    <Document>
      <Page size={theme?.page.size ?? "A4"} style={pageStyle(theme)}>
        <Header theme={theme} title={theme?.header.title || undefined} companyName={data.companyName} />

        <StudentDetailsChart student={data.student} destinationLabel={data.destinationLabel} theme={theme} />
        <AndLine theme={theme} />

        <OfficeLine text={data.officeLine} theme={theme} />

        <Blocks blocks={data.blocks} fee={data.fee} theme={theme} />

        <SignatureBlock
          companyName={data.companyName}
          leftCaption="(Signature) Client"
          leftName={data.student.fullName}
          leftNameCaption="[Client Name]"
          rightNameCaption="[Consultant Full Name]"
          signatureDataUri={data.signatureDataUri}
          signatoryName={data.signatoryName}
          theme={theme}
        />

        <Footer date={data.agreementDate} signatureDataUri={data.signatureDataUri} theme={theme} />
      </Page>
    </Document>
  );
}

// ------------------------------------------------------------ staff agreements
//
// The same letterhead, wording renderer, signature and footer as a student's
// agreement — kept in this file so the two cannot drift apart in look — with
// the staff member's details where the student's chart goes, and no fee table:
// a staff template is converted with wordingToBlocks(..., { feeTable: false }),
// so none of its blocks ever asks for one.

export type StaffAgreementPdfData = {
  title: string;
  officeLine: string;
  /** Header and signature caption; Company details (0288). */
  companyName?: string;
  blocks: AgreementBlock[];
  staff: {
    fullName: string;
    designation: string | null;
    cnic: string | null;
    dob: string | null;
    email: string | null;
    mobile: string | null;
    address: string | null;
  };
  agreementDate: string;
  signatureDataUri: string | null;
  signatoryName: string | null;
  /** The template's design; absent or null prints the Classic look. */
  theme?: Theme | null;
};

// The visa documentation and application service alone: the fee, in the
// instalments agreed, and the total — nothing to charge for admission.
function VisaServiceFeeTable({ fee }: { fee: AgreementPdfData["fee"] }) {
  const rows: { label: string; note?: string; value: number }[] = [];
  if (fee.installmentAmounts.length <= 1) {
    rows.push({ label: "Visa Documentation & Application Fee", note: "Pay at the time of signing the agreement", value: fee.installmentAmounts[0] ?? fee.consultancyFee });
  } else {
    fee.installmentAmounts.forEach((amount, i) => {
      const schedule = INSTALLMENT_SCHEDULE[i] ?? { label: `Installment ${i + 1}`, note: undefined };
      rows.push({ label: `Visa Service — ${schedule.label}`, note: schedule.note, value: amount });
    });
  }
  rows.push({
    label: "Total Professional Fee",
    note: fee.discount && fee.discount > 0 ? `Includes a discount of ${money(fee.currencySymbol, fee.discount)}, already applied above` : undefined,
    value: fee.total,
  });
  return (
    <View style={styles.feeTable}>
      {rows.map((row, i) => (
        <View key={row.label} style={[styles.feeRow, i === rows.length - 1 ? styles.feeRowLast : {}]}>
          <Text style={styles.feeLabel}>
            {row.label}
            {row.note && <Text style={styles.feeLabelNote}>{"\n"}{row.note}</Text>}
          </Text>
          <Text style={styles.feeValue}>{money(fee.currencySymbol, row.value)}</Text>
        </View>
      ))}
    </View>
  );
}

// Block's signature wants a fee for the feeTable case, which a staff
// agreement never reaches.
const NO_FEE: AgreementPdfData["fee"] = {
  currencySymbol: "",
  adminCharge: 0,
  consultancyFee: 0,
  installmentAmounts: [],
  discount: null,
  total: 0,
  isBackup: false,
  destinationLabel: "",
};

function StaffDetailsChart({ staff, theme }: { staff: StaffAgreementPdfData["staff"]; theme?: Theme | null }) {
  return (
    <DetailsChart
      theme={theme}
      rows={[
        [
          { label: "Name", value: staff.fullName },
          { label: "Designation", value: staff.designation ?? "" },
          { label: "CNIC", value: staff.cnic ?? "" },
        ],
        [
          { label: "DOB", value: staff.dob ?? "" },
          { label: "Email", value: staff.email ?? "" },
          { label: "Mobile", value: staff.mobile ?? "" },
        ],
        [{ label: "Address", value: staff.address ?? "", full: true }],
      ]}
    />
  );
}

export function StaffAgreementDocument({ data }: { data: StaffAgreementPdfData }) {
  const theme = data.theme ?? null;
  return (
    <Document>
      <Page size={theme?.page.size ?? "A4"} style={pageStyle(theme)}>
        {/* A staff template's letterhead names the template unless its design names something else. */}
        <Header title={theme?.header.title || data.title} theme={theme} companyName={data.companyName} />

        <StaffDetailsChart staff={data.staff} theme={theme} />
        <AndLine theme={theme} />

        <OfficeLine text={data.officeLine} theme={theme} />

        <Blocks blocks={data.blocks} fee={NO_FEE} theme={theme} />

        <SignatureBlock
          companyName={data.companyName}
          leftCaption="(Signature) Employee"
          leftName={data.staff.fullName}
          leftNameCaption="[Employee Name]"
          rightNameCaption="[Authorised Signatory]"
          signatureDataUri={data.signatureDataUri}
          signatoryName={data.signatoryName}
          theme={theme}
        />

        <Footer date={data.agreementDate} signatureDataUri={data.signatureDataUri} theme={theme} />
      </Page>
    </Document>
  );
}
