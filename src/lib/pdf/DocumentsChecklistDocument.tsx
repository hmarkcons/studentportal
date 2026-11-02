import { Document, Page, Text, View, Image, Link as PdfLink, StyleSheet, Font, type Styles } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { BRAND_LOGO_DATA_URI, BRAND_LOGO_RATIO } from "./brandLogo";
import { day, dayOf, pdfSafe } from "../studentReport";
import {
  CHECKLIST_STATES,
  CHECKLIST_STATE_COLORS,
  CHECKLIST_STATE_LABELS,
  type ChecklistCounts,
  type ChecklistDoc,
  type ChecklistReport,
  type ChecklistStudent,
} from "../documentChecklistReport";

// The documents checklist for every registered student (or those the filters
// keep): a first page with the totals and one row per student, then each
// student from a page of their own — their documents in the Documents tab's
// sections, each with a chip in its status colour.
//
// Built as the status report is (StudentReportDocument.tsx): standard
// Helvetica, every string through pdfSafe, no lineHeight on a View, and each
// student's rows flat siblings with only the leaf rows kept whole — nested
// unbreakable blocks pile up at the foot of a page.
//
// Unlike the status report, each student is a <Page> of their own rather than
// a <View break> in one long page. react-pdf lays the rest of a <Page> out
// again at every page break, so one <Page> running to sixty pages took 52
// seconds for 47 students (5 took 1.4s, 20 took 10s); a <Page> per student
// keeps it in proportion to the number of students.

Font.registerHyphenationCallback((word) => [word]);

const INK = "#1F2937";
const SOFT = "#4B5563";
const GREY = "#6B7280";
const RULE = "#E5E7EB";
const PANEL = "#F8FAFC";
const TRACK = "#E5E7EB";
const BRAND = "#0369A1";

type Style = Styles[string];

const t = (v: string | null | undefined) => pdfSafe(v);

const styles = StyleSheet.create({
  page: { paddingHorizontal: 36, paddingTop: 30, paddingBottom: 48, fontSize: 9, color: INK, fontFamily: "Helvetica" },

  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { height: 34, width: 34 * BRAND_LOGO_RATIO },
  headRight: { alignItems: "flex-end", maxWidth: 330 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 16, letterSpacing: 0.4, color: INK, lineHeight: 1.1 },
  prepared: { fontSize: 7.5, color: GREY, marginTop: 4, textAlign: "right", lineHeight: 1.3 },
  strip: { flexDirection: "row", height: 4, marginTop: 10, marginBottom: 12 },

  kpis: { flexDirection: "row" },
  kpi: { flex: 1, borderWidth: 1, borderColor: RULE, borderTopWidth: 3, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 8, backgroundColor: PANEL },
  kpiGap: { width: 7 },
  kpiLabel: { fontSize: 6.8, color: GREY, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 17, color: INK, marginTop: 3, lineHeight: 1 },
  kpiSub: { fontSize: 7.2, color: SOFT, marginTop: 3, lineHeight: 1.25 },

  overall: { marginTop: 12 },
  overallHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  overallLabel: { fontFamily: "Helvetica-Bold", fontSize: 8.6 },
  overallNum: { fontSize: 8, color: SOFT },
  bigBar: { height: 10, flexDirection: "row", backgroundColor: TRACK, borderRadius: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5 },
  legendText: { fontSize: 7.4, color: SOFT },
  meaning: { fontSize: 7.2, color: GREY, marginTop: 4, lineHeight: 1.35 },

  h2: { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: INK, marginTop: 14, marginBottom: 5 },

  tHead: { flexDirection: "row", backgroundColor: "#F1F5F9", borderBottomWidth: 1, borderBottomColor: RULE, paddingVertical: 4, paddingHorizontal: 4 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 6.8, color: SOFT, textTransform: "uppercase", letterSpacing: 0.3 },
  tRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3.6, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  cNum: { width: 18, fontSize: 7.4, color: GREY },
  cStudent: { width: 132, paddingRight: 6 },
  cDest: { width: 92, paddingRight: 6 },
  cOfficer: { width: 76, paddingRight: 6 },
  cCount: { width: 34, textAlign: "right", paddingRight: 4 },
  cBar: { flex: 1, flexDirection: "row", alignItems: "center", paddingLeft: 6 },
  tName: { fontFamily: "Helvetica-Bold", fontSize: 8.2, color: INK, lineHeight: 1.25 },
  tCode: { fontFamily: "Courier", fontSize: 6.8, color: BRAND, marginTop: 1 },
  tCell: { fontSize: 7.6, color: SOFT, lineHeight: 1.25 },
  tNum: { fontSize: 8.2, fontFamily: "Helvetica-Bold" },
  miniBar: { flex: 1, height: 6, flexDirection: "row", backgroundColor: TRACK, borderRadius: 1.5 },
  pct: { width: 30, textAlign: "right", fontSize: 7.8, fontFamily: "Helvetica-Bold", color: INK },
  empty: { fontSize: 8.4, color: GREY, paddingVertical: 8, fontFamily: "Helvetica-Oblique" },

  band: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 4, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: BRAND },
  bandLeft: { flex: 1, paddingRight: 10 },
  bandName: { fontFamily: "Helvetica-Bold", fontSize: 12.5, color: "#FFFFFF", lineHeight: 1.15 },
  bandCode: { fontFamily: "Courier-Bold", fontSize: 8.4, color: "#E0F2FE", marginTop: 2 },
  bandRight: { alignItems: "flex-end" },
  bandPct: { fontFamily: "Helvetica-Bold", fontSize: 16, color: "#FFFFFF", lineHeight: 1 },
  bandSub: { fontSize: 7.2, color: "#E0F2FE", marginTop: 2 },

  facts: { flexDirection: "row", flexWrap: "wrap", marginTop: 7 },
  fact: { width: "33.3%", paddingRight: 8, marginBottom: 4 },
  factKey: { fontSize: 6.6, color: GREY, textTransform: "uppercase", letterSpacing: 0.4 },
  factVal: { fontSize: 8.4, color: INK, lineHeight: 1.3 },

  studentBar: { height: 6, flexDirection: "row", backgroundColor: TRACK, borderRadius: 1.5, marginTop: 2 },
  countLine: { flexDirection: "row", flexWrap: "wrap", marginTop: 5, marginBottom: 2 },
  countItem: { flexDirection: "row", alignItems: "center", marginRight: 12 },
  countText: { fontSize: 7.6, color: SOFT },
  countNum: { fontSize: 7.6, fontFamily: "Helvetica-Bold", color: INK },

  section: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 7, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: BRAND },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 8.6, color: BRAND, textTransform: "uppercase", letterSpacing: 0.4 },
  sectionCount: { fontSize: 7.2, color: SOFT },

  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 2.3, paddingLeft: 5, borderLeftWidth: 2, borderBottomWidth: 0.5, borderBottomColor: RULE },
  chip: { width: 74, borderRadius: 3, paddingVertical: 1.6, paddingHorizontal: 3, marginRight: 8, marginTop: 0.5 },
  chipText: { fontFamily: "Helvetica-Bold", fontSize: 6.8, color: "#FFFFFF", textAlign: "center", lineHeight: 1.2 },
  rowBody: { flex: 1, paddingRight: 8 },
  rowName: { fontSize: 8.2, color: INK, lineHeight: 1.25 },
  rowNameDone: { fontSize: 8.2, color: SOFT, lineHeight: 1.25 },
  rowDetail: { fontSize: 7.4, color: SOFT, marginTop: 1, lineHeight: 1.3 },
  rowDetailBad: { fontSize: 7.4, color: CHECKLIST_STATE_COLORS.sent_back, marginTop: 1, lineHeight: 1.3, fontFamily: "Helvetica-Bold" },
  rowStamp: { width: 118, fontSize: 7.2, color: GREY, textAlign: "right", marginTop: 0.5, lineHeight: 1.3 },
  rowStampBad: { width: 118, fontSize: 7.2, color: CHECKLIST_STATE_COLORS.missing, textAlign: "right", marginTop: 0.5, lineHeight: 1.3, fontFamily: "Helvetica-Bold" },

  // A width of its own: a page number drawn without one is measured as nothing, and not drawn.
  footRule: { position: "absolute", left: 36, right: 36, bottom: 32, height: 0.5, backgroundColor: RULE },
  footLeft: { position: "absolute", left: 36, right: 130, bottom: 20, fontSize: 7, color: GREY },
  footRight: { position: "absolute", left: 36, right: 36, bottom: 20, textAlign: "right", fontSize: 7, color: GREY },
});

export type ChecklistPdfData = {
  report: ChecklistReport;
  /** "2 Nov 2026" */
  preparedOn: string;
  preparedBy: string | null;
  /** describeFilters(...) */
  filters: string;
};

// ------------------------------------------------------------------ pieces

/** A bar in the statuses' colours, each part as long as its share. */
function StateBar({ counts, style }: { counts: ChecklistCounts; style: Style }) {
  const parts: [string, number][] = [
    [CHECKLIST_STATE_COLORS.approved, counts.approved],
    [CHECKLIST_STATE_COLORS.review, counts.review],
    [CHECKLIST_STATE_COLORS.missing, counts.missing],
    [CHECKLIST_STATE_COLORS.sent_back, counts.sentBack],
  ];
  return (
    <View style={style}>
      {parts
        .filter(([, n]) => n > 0)
        .map(([color, n]) => (
          <View key={color} style={{ flexGrow: n, flexBasis: 0, backgroundColor: color }} />
        ))}
    </View>
  );
}

function Legend() {
  return (
    <View style={styles.legend}>
      {CHECKLIST_STATES.map((s) => (
        <View key={s} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: CHECKLIST_STATE_COLORS[s] }]} />
          <Text style={styles.legendText}>{CHECKLIST_STATE_LABELS[s]}</Text>
        </View>
      ))}
    </View>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string | null; color: string }) {
  return (
    <View style={[styles.kpi, { borderTopColor: color }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {sub ? <Text style={styles.kpiSub}>{t(sub)}</Text> : null}
    </View>
  );
}

function pctText(percent: number | null): string {
  return percent === null ? "—" : `${percent}%`;
}

function Footer({ data }: { data: ChecklistPdfData }) {
  return [
    <View key="rule" style={styles.footRule} fixed />,
    <Text key="text" style={styles.footLeft} fixed>
      {t(`HMARK Consultants · Documents checklist · prepared ${data.preparedOn}${data.preparedBy ? ` by ${data.preparedBy}` : ""} · internal`)}
    </Text>,
    <Text key="page" style={styles.footRight} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />,
  ];
}

function SummaryRow({ s, n }: { s: ChecklistStudent; n: number }) {
  return (
    // Each row links to the student's own pages further on.
    <PdfLink src={`#s-${s.id}`} style={{ textDecoration: "none", color: INK }}>
      <View style={styles.tRow} wrap={false}>
        <Text style={styles.cNum}>{n}</Text>
        <View style={styles.cStudent}>
          <Text style={styles.tName}>{t(s.name)}</Text>
          <Text style={styles.tCode}>{t(s.code ?? "No Student ID yet")}</Text>
        </View>
        <View style={styles.cDest}>
          <Text style={styles.tCell}>{t(s.countries.join(", ") || "—")}</Text>
        </View>
        <View style={styles.cOfficer}>
          <Text style={styles.tCell}>{t(s.officer ?? "Not assigned")}</Text>
        </View>
        <Text style={[styles.cCount, styles.tNum, { color: CHECKLIST_STATE_COLORS.approved }]}>{s.counts.approved}</Text>
        <Text style={[styles.cCount, styles.tNum, { color: s.counts.review ? CHECKLIST_STATE_COLORS.review : GREY }]}>{s.counts.review}</Text>
        <Text style={[styles.cCount, styles.tNum, { color: s.counts.left ? CHECKLIST_STATE_COLORS.missing : GREY }]}>{s.counts.left}</Text>
        <View style={styles.cBar}>
          <StateBar counts={s.counts} style={styles.miniBar} />
          <Text style={styles.pct}>{pctText(s.percent)}</Text>
        </View>
      </View>
    </PdfLink>
  );
}

/** What is said at the right of a document's row: when it was approved or uploaded, or when it is due. */
function stampFor(d: ChecklistDoc): { text: string | null; bad: boolean } {
  if (d.state === "approved") return { text: dayOf(d.verifiedAt) ? `Approved ${dayOf(d.verifiedAt)}` : "Approved", bad: false };
  if (d.overdue) return { text: `Overdue — due ${day(d.deadline)}`, bad: true };
  if (d.deadline) return { text: `Due ${day(d.deadline)}`, bad: false };
  if (d.state === "review") return { text: dayOf(d.uploadedAt) ? `Uploaded ${dayOf(d.uploadedAt)}` : null, bad: false };
  if (d.state === "sent_back") return { text: dayOf(d.uploadedAt) ? `Uploaded ${dayOf(d.uploadedAt)}` : null, bad: false };
  return { text: null, bad: false };
}

function DocRow({ d }: { d: ChecklistDoc }) {
  const color = CHECKLIST_STATE_COLORS[d.state];
  const stamp = stampFor(d);
  return (
    <View style={[styles.row, { borderLeftColor: color }]} wrap={false}>
      <View style={[styles.chip, { backgroundColor: color }]}>
        <Text style={styles.chipText}>{CHECKLIST_STATE_LABELS[d.state]}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={d.state === "approved" ? styles.rowNameDone : styles.rowName}>{t(d.name)}</Text>
        {d.state === "sent_back" ? <Text style={styles.rowDetailBad}>{t(d.reason ? `Sent back: ${d.reason}` : "Sent back to the student")}</Text> : null}
        {d.carriedFrom ? <Text style={styles.rowDetail}>{`Carried over from intake ${d.carriedFrom}`}</Text> : null}
      </View>
      <Text style={stamp.bad ? styles.rowStampBad : styles.rowStamp}>{t(stamp.text ?? "")}</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factKey}>{label}</Text>
      <Text style={styles.factVal}>{t(value || "—")}</Text>
    </View>
  );
}

function CountLine({ c }: { c: ChecklistCounts }) {
  const items: [string, number, string][] = [
    [CHECKLIST_STATE_LABELS.approved, c.approved, CHECKLIST_STATE_COLORS.approved],
    [CHECKLIST_STATE_LABELS.review, c.review, CHECKLIST_STATE_COLORS.review],
    [CHECKLIST_STATE_LABELS.missing, c.missing, CHECKLIST_STATE_COLORS.missing],
    [CHECKLIST_STATE_LABELS.sent_back, c.sentBack, CHECKLIST_STATE_COLORS.sent_back],
  ];
  return (
    <View style={styles.countLine}>
      {items.map(([label, n, color]) => (
        <View key={label} style={styles.countItem}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.countText}>
            {label} <Text style={styles.countNum}>{n}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

/** One student, on pages of their own. Flat: the band, the facts and every row are siblings. */
function StudentPages({ s, data }: { s: ChecklistStudent; data: ChecklistPdfData }) {
  const rows: ReactNode[] = [
    <View key="band" style={styles.band} wrap={false}>
      <View style={styles.bandLeft}>
        <Text style={styles.bandName}>{t(s.name)}</Text>
        <Text style={styles.bandCode}>{t(s.code ?? "No Student ID yet")}</Text>
      </View>
      <View style={styles.bandRight}>
        <Text style={styles.bandPct}>{pctText(s.percent)}</Text>
        <Text style={styles.bandSub}>
          {s.counts.total ? `${s.counts.approved} of ${s.counts.total} approved · ${s.counts.left} left to do` : "No checklist yet"}
        </Text>
      </View>
    </View>,
    <View key="facts" style={styles.facts}>
      <Fact label="Destination" value={s.countries.join(", ")} />
      <Fact label="Intake" value={s.intake} />
      <Fact label="Processing officer" value={s.officer ?? "Not assigned"} />
    </View>,
    <StateBar key="bar" counts={s.counts} style={styles.studentBar} />,
    <CountLine key="counts" c={s.counts} />,
  ];
  if (s.counts.total === 0) {
    rows.push(
      <Text key="none" style={styles.empty}>
        Nothing is on this student&apos;s checklist yet. It is drawn up from their destinations and profile when their record is opened.
      </Text>
    );
  }
  s.sections.forEach((section) => {
    rows.push(
      <View key={`h-${section.key}`} style={styles.section} wrap={false} minPresenceAhead={36}>
        <Text style={styles.sectionTitle}>{t(section.label)}</Text>
        <Text style={styles.sectionCount}>
          {`${section.counts.approved} of ${section.counts.total} approved${section.counts.left ? ` · ${section.counts.left} left` : ""}${section.counts.review ? ` · ${section.counts.review} to review` : ""}`}
        </Text>
      </View>
    );
    section.docs.forEach((d) => rows.push(<DocRow key={d.id} d={d} />));
  });
  return (
    <Page size="A4" style={styles.page}>
      {Footer({ data })}
      <View id={`s-${s.id}`}>{rows}</View>
    </Page>
  );
}

// ------------------------------------------------------------------ the document

export function DocumentsChecklistDocument({ data }: { data: ChecklistPdfData }) {
  const { report } = data;
  const tt = report.totals;
  return (
    <Document title="Documents checklist" author="HMARK Consultants" subject="Documents checklist for registered students" creator="HMARK Student Portal">
      <Page size="A4" style={styles.page}>
        {Footer({ data })}
        <View>
          <View style={styles.head}>
            <Image src={BRAND_LOGO_DATA_URI} style={styles.logo} />
            <View style={styles.headRight}>
              <Text style={styles.title}>DOCUMENTS CHECKLIST</Text>
              <Text style={styles.prepared}>{t(`Prepared ${data.preparedOn}${data.preparedBy ? ` by ${data.preparedBy}` : ""}`)}</Text>
              <Text style={styles.prepared}>{t(data.filters)}</Text>
            </View>
          </View>
          <View style={styles.strip}>
            {CHECKLIST_STATES.map((s) => (
              <View key={s} style={{ flex: 1, backgroundColor: CHECKLIST_STATE_COLORS[s] }} />
            ))}
          </View>

          <View style={styles.kpis}>
            <Kpi label="Students" value={String(tt.students)} sub={tt.complete ? `${tt.complete} with every document approved` : "None complete yet"} color={BRAND} />
            <View style={styles.kpiGap} />
            <Kpi label="Documents" value={String(tt.total)} sub={tt.students ? `${Math.round(tt.total / tt.students)} per student on average` : null} color={GREY} />
            <View style={styles.kpiGap} />
            <Kpi label="Approved" value={String(tt.approved)} sub={`${pctText(tt.percent)} of all documents`} color={CHECKLIST_STATE_COLORS.approved} />
            <View style={styles.kpiGap} />
            <Kpi label="Awaiting review" value={String(tt.review)} sub="Uploaded, for staff to check" color={CHECKLIST_STATE_COLORS.review} />
            <View style={styles.kpiGap} />
            <Kpi label="Left to do" value={String(tt.left)} sub={`${tt.missing} missing · ${tt.sentBack} sent back`} color={CHECKLIST_STATE_COLORS.missing} />
          </View>

          <View style={styles.overall}>
            <View style={styles.overallHead}>
              <Text style={styles.overallLabel}>All documents</Text>
              <Text style={styles.overallNum}>{`${tt.approved} of ${tt.total} approved · ${pctText(tt.percent)}`}</Text>
            </View>
            <StateBar counts={tt} style={styles.bigBar} />
            <Legend />
            <Text style={styles.meaning}>
              Approved: checked and accepted by staff. Awaiting review: uploaded, waiting for staff to check. Missing: not uploaded yet. Sent back:
              uploaded but returned to the student to do again. Left to do = missing + sent back.
            </Text>
          </View>

          <Text style={styles.h2}>{`Students (${tt.students})`}</Text>
          <View style={styles.tHead}>
            <Text style={[styles.th, styles.cNum]}>#</Text>
            <Text style={[styles.th, styles.cStudent]}>Student</Text>
            <Text style={[styles.th, styles.cDest]}>Destination</Text>
            <Text style={[styles.th, styles.cOfficer]}>Officer</Text>
            <Text style={[styles.th, styles.cCount]}>Done</Text>
            <Text style={[styles.th, styles.cCount]}>Review</Text>
            <Text style={[styles.th, styles.cCount]}>Left</Text>
            <Text style={[styles.th, { flex: 1, paddingLeft: 6 }]}>Progress</Text>
          </View>
          {report.students.length === 0 ? <Text style={styles.empty}>No students match these filters.</Text> : null}
          {report.students.map((s, i) => (
            <SummaryRow key={s.id} s={s} n={i + 1} />
          ))}
        </View>
      </Page>

      {report.students.map((s) => (
        <StudentPages key={s.id} s={s} data={data} />
      ))}
    </Document>
  );
}
