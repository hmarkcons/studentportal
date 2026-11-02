import { Document, Page, Text, View, Image, Link as PdfLink, StyleSheet, Font, type Styles } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { BRAND_LOGO_DATA_URI, BRAND_LOGO_RATIO } from "./brandLogo";
import { day, dayOf, pdfSafe } from "../studentReport";
import {
  GROUPS,
  GROUP_COLORS,
  GROUP_LABELS,
  type AppCounts,
  type ApplicationsReport,
  type AppReportStudent,
  type ReportApplication,
} from "../applicationsReport";

// Applications & portal logins for every registered student (or those the
// filters keep): a first page with the totals and one row per student, then
// each student on pages of their own — every application with where it
// stands, its deadline, and the university-portal login saved against it,
// password included. A report of one student is that student's document.
//
// Laid out as the documents checklist is (DocumentsChecklistDocument.tsx):
// standard Helvetica through pdfSafe, no lineHeight on a View, flat rows with
// only the leaf kept whole, and a <Page> per student — one long Page is laid
// out again at every break and grows with the square of its length.
//
// It holds passwords, so it says so at the top and in every page's footer.

Font.registerHyphenationCallback((word) => [word]);

const INK = "#1F2937";
const SOFT = "#4B5563";
const GREY = "#6B7280";
const RULE = "#E5E7EB";
const PANEL = "#F8FAFC";
const BRAND = "#0369A1";
const ALERT = "#B91C1C";

type Style = Styles[string];

const t = (v: string | null | undefined) => pdfSafe(v);

const styles = StyleSheet.create({
  page: { paddingHorizontal: 36, paddingTop: 30, paddingBottom: 48, fontSize: 9, color: INK, fontFamily: "Helvetica" },

  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { height: 34, width: 34 * BRAND_LOGO_RATIO },
  headRight: { alignItems: "flex-end", maxWidth: 340 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 0.4, color: INK, lineHeight: 1.1 },
  confidential: { fontFamily: "Helvetica-Bold", fontSize: 7.6, color: ALERT, marginTop: 4, letterSpacing: 0.4 },
  prepared: { fontSize: 7.5, color: GREY, marginTop: 3, textAlign: "right", lineHeight: 1.3 },
  strip: { flexDirection: "row", height: 4, marginTop: 10, marginBottom: 12 },
  warn: { fontSize: 8, color: ALERT, fontFamily: "Helvetica-Bold", marginBottom: 8, lineHeight: 1.35 },

  kpis: { flexDirection: "row" },
  kpi: { flex: 1, borderWidth: 1, borderColor: RULE, borderTopWidth: 3, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 8, backgroundColor: PANEL },
  kpiGap: { width: 7 },
  kpiLabel: { fontSize: 6.8, color: GREY, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 17, color: INK, marginTop: 3, lineHeight: 1 },
  kpiSub: { fontSize: 7.2, color: SOFT, marginTop: 3, lineHeight: 1.25 },

  legend: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5 },
  legendText: { fontSize: 7.4, color: SOFT },

  h2: { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: INK, marginTop: 14, marginBottom: 5 },
  tHead: { flexDirection: "row", backgroundColor: "#F1F5F9", borderBottomWidth: 1, borderBottomColor: RULE, paddingVertical: 4, paddingHorizontal: 4 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 6.6, color: SOFT, textTransform: "uppercase", letterSpacing: 0.3 },
  tRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3.6, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  cNum: { width: 18, fontSize: 7.4, color: GREY },
  cStudent: { width: 140, paddingRight: 6 },
  cDest: { width: 98, paddingRight: 6 },
  cOfficer: { width: 74, paddingRight: 6 },
  cCount: { width: 38, textAlign: "right", paddingRight: 4 },
  tName: { fontFamily: "Helvetica-Bold", fontSize: 8.2, color: INK, lineHeight: 1.25 },
  tCode: { fontFamily: "Courier", fontSize: 6.8, color: BRAND, marginTop: 1 },
  tCell: { fontSize: 7.6, color: SOFT, lineHeight: 1.25 },
  tNum: { fontSize: 8.2, fontFamily: "Helvetica-Bold" },
  empty: { fontSize: 8.4, color: GREY, paddingVertical: 8, fontFamily: "Helvetica-Oblique" },

  band: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 4, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: BRAND },
  bandLeft: { flex: 1, paddingRight: 10 },
  bandName: { fontFamily: "Helvetica-Bold", fontSize: 12.5, color: "#FFFFFF", lineHeight: 1.15 },
  bandCode: { fontFamily: "Courier-Bold", fontSize: 8.4, color: "#E0F2FE", marginTop: 2 },
  bandRight: { alignItems: "flex-end" },
  bandBig: { fontFamily: "Helvetica-Bold", fontSize: 15, color: "#FFFFFF", lineHeight: 1 },
  bandSub: { fontSize: 7.2, color: "#E0F2FE", marginTop: 2 },

  facts: { flexDirection: "row", flexWrap: "wrap", marginTop: 7 },
  fact: { width: "33.3%", paddingRight: 8, marginBottom: 4 },
  factKey: { fontSize: 6.6, color: GREY, textTransform: "uppercase", letterSpacing: 0.4 },
  factVal: { fontSize: 8.4, color: INK, lineHeight: 1.3 },
  countLine: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginBottom: 4 },
  countItem: { flexDirection: "row", alignItems: "center", marginRight: 12 },
  countText: { fontSize: 7.6, color: SOFT },
  countNum: { fontSize: 7.6, fontFamily: "Helvetica-Bold", color: INK },
  note: { fontSize: 7.6, color: GREY, fontFamily: "Helvetica-Oblique", marginBottom: 4, lineHeight: 1.3 },

  app: { borderLeftWidth: 3, borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 5, paddingLeft: 7, paddingRight: 2 },
  appTop: { flexDirection: "row", alignItems: "flex-start" },
  appNum: { width: 20, fontFamily: "Helvetica-Bold", fontSize: 9, color: GREY },
  appBody: { flex: 1, paddingRight: 8 },
  uni: { fontFamily: "Helvetica-Bold", fontSize: 9, color: INK, lineHeight: 1.25 },
  city: { fontFamily: "Helvetica", fontSize: 8, color: GREY },
  prog: { fontSize: 7.8, color: SOFT, marginTop: 1.5, lineHeight: 1.3 },
  statusCol: { width: 120, alignItems: "flex-start" },
  chip: { borderRadius: 3, paddingVertical: 1.8, paddingHorizontal: 5 },
  chipText: { fontFamily: "Helvetica-Bold", fontSize: 6.8, color: "#FFFFFF", lineHeight: 1.2 },
  stage: { fontSize: 7.2, color: SOFT, marginTop: 2, lineHeight: 1.25 },
  dateCol: { width: 92, alignItems: "flex-end" },
  date: { fontSize: 7.4, color: SOFT, textAlign: "right", lineHeight: 1.3 },
  dateBad: { fontSize: 7.4, color: ALERT, textAlign: "right", fontFamily: "Helvetica-Bold", lineHeight: 1.3 },
  final: { fontSize: 7, color: "#166534", fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 1.5 },
  portalLink: { marginTop: 4, textDecoration: "none" },
  portalBtn: { backgroundColor: BRAND, borderRadius: 3, paddingVertical: 2.4, paddingHorizontal: 7 },
  portalBtnText: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", lineHeight: 1.2 },

  login: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 4, marginLeft: 20, backgroundColor: "#FFFBEB", borderWidth: 0.6, borderColor: "#FCD34D", borderRadius: 3, paddingVertical: 3, paddingHorizontal: 6 },
  loginLabel: { fontFamily: "Helvetica-Bold", fontSize: 7.2, color: "#92400E", marginRight: 10 },
  loginKey: { fontSize: 7, color: GREY },
  loginVal: { fontFamily: "Courier-Bold", fontSize: 8.4, color: INK, marginRight: 12 },
  loginLink: { fontSize: 7.2, color: BRAND, textDecoration: "none" },
  noLogin: { fontSize: 7.4, color: GREY, fontFamily: "Helvetica-Oblique", marginTop: 3, marginLeft: 20, lineHeight: 1.3 },

  footRule: { position: "absolute", left: 36, right: 36, bottom: 32, height: 0.5, backgroundColor: RULE },
  footLeft: { position: "absolute", left: 36, right: 130, bottom: 20, fontSize: 7, color: GREY },
  footRight: { position: "absolute", left: 36, right: 36, bottom: 20, textAlign: "right", fontSize: 7, color: GREY },
});

export type ApplicationsPdfData = {
  report: ApplicationsReport;
  preparedOn: string;
  preparedBy: string | null;
  filters: string;
  loginsError: string | null;
};

// ------------------------------------------------------------------ pieces

function Footer({ data }: { data: ApplicationsPdfData }) {
  return [
    <View key="rule" style={styles.footRule} fixed />,
    <Text key="text" style={styles.footLeft} fixed>
      {t(`CONFIDENTIAL — contains passwords · HMARK Consultants · Applications & portal logins · prepared ${data.preparedOn}${data.preparedBy ? ` by ${data.preparedBy}` : ""}`)}
    </Text>,
    <Text key="page" style={styles.footRight} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />,
  ];
}

function Head({ data }: { data: ApplicationsPdfData }) {
  return (
    <View>
      <View style={styles.head}>
        <Image src={BRAND_LOGO_DATA_URI} style={styles.logo} />
        <View style={styles.headRight}>
          <Text style={styles.title}>APPLICATIONS & PORTAL LOGINS</Text>
          <Text style={styles.confidential}>CONFIDENTIAL — CONTAINS PASSWORDS</Text>
          <Text style={styles.prepared}>{t(`Prepared ${data.preparedOn}${data.preparedBy ? ` by ${data.preparedBy}` : ""}`)}</Text>
          <Text style={styles.prepared}>{t(data.filters)}</Text>
        </View>
      </View>
      <View style={styles.strip}>
        {GROUPS.map((g) => (
          <View key={g} style={{ flex: 1, backgroundColor: GROUP_COLORS[g] }} />
        ))}
      </View>
      {data.loginsError ? <Text style={styles.warn}>{t(`The logins could not be read, so none are shown: ${data.loginsError}`)}</Text> : null}
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

function CountLine({ c, style }: { c: AppCounts; style?: Style }) {
  return (
    <View style={style ?? styles.countLine}>
      {GROUPS.map((g) => (
        <View key={g} style={styles.countItem}>
          <View style={[styles.dot, { backgroundColor: GROUP_COLORS[g] }]} />
          <Text style={styles.countText}>
            {GROUP_LABELS[g]} <Text style={styles.countNum}>{c[g]}</Text>
          </Text>
        </View>
      ))}
      <View style={styles.countItem}>
        <Text style={styles.countText}>
          Logins saved <Text style={styles.countNum}>{`${c.withLogin} of ${c.total}`}</Text>
        </Text>
      </View>
    </View>
  );
}

function SummaryRow({ s, n }: { s: AppReportStudent; n: number }) {
  const c = s.counts;
  return (
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
        <Text style={[styles.cCount, styles.tNum]}>{c.total}</Text>
        <Text style={[styles.cCount, styles.tNum, { color: c.progress ? GROUP_COLORS.progress : GREY }]}>{c.progress}</Text>
        <Text style={[styles.cCount, styles.tNum, { color: c.accepted ? GROUP_COLORS.accepted : GREY }]}>{c.accepted}</Text>
        <Text style={[styles.cCount, styles.tNum, { color: c.closed + c.rejected ? GROUP_COLORS.rejected : GREY }]}>{c.closed + c.rejected}</Text>
        <Text style={[styles.cCount, styles.tNum, { flex: 1, color: c.withLogin ? INK : GREY }]}>{c.total ? `${c.withLogin}/${c.total}` : "—"}</Text>
      </View>
    </PdfLink>
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

function ApplicationRow({ a }: { a: ReportApplication }) {
  const color = GROUP_COLORS[a.group];
  const details = [a.programme ?? "Programme not chosen", a.level, a.intake, a.round, a.country].filter(Boolean).join(" · ");
  return (
    <View style={[styles.app, { borderLeftColor: color }]} wrap={false}>
      <View style={styles.appTop}>
        <Text style={styles.appNum}>{`#${a.number}`}</Text>
        <View style={styles.appBody}>
          <Text style={styles.uni}>
            {t(a.university)}
            {a.city ? <Text style={styles.city}>{t(`  ·  ${a.city}`)}</Text> : null}
          </Text>
          <Text style={styles.prog}>{t(details)}</Text>
        </View>
        <View style={styles.statusCol}>
          <View style={[styles.chip, { backgroundColor: color }]}>
            <Text style={styles.chipText}>{GROUP_LABELS[a.group]}</Text>
          </View>
          <Text style={styles.stage}>{t(`${a.stageLabel}${a.step ? ` · step ${a.step.step} of ${a.step.of}` : ""}`)}</Text>
        </View>
        <View style={styles.dateCol}>
          {a.deadline ? (
            <Text style={a.deadlinePassed ? styles.dateBad : styles.date}>{t(`${a.deadlinePassed ? "Deadline passed" : "Deadline"} ${day(a.deadline)}`)}</Text>
          ) : (
            <Text style={styles.date}>No deadline set</Text>
          )}
          {a.finalizedBadge ? <Text style={styles.final}>{t(a.finalizedBadge)}</Text> : null}
          {/* Clickable on screen; on paper the address is in the login line below. */}
          {a.portalUrl ? (
            <PdfLink src={a.portalUrl} style={styles.portalLink}>
              <View style={styles.portalBtn}>
                <Text style={styles.portalBtnText}>Open portal  &gt;</Text>
              </View>
            </PdfLink>
          ) : null}
        </View>
      </View>
      {a.logins.map((l, i) => (
        <View key={i} style={styles.login}>
          <Text style={styles.loginLabel}>{t(l.label)}</Text>
          <Text style={styles.loginKey}>Username </Text>
          <Text style={styles.loginVal}>{t(l.username || "—")}</Text>
          <Text style={styles.loginKey}>Password </Text>
          <Text style={styles.loginVal}>{t(l.password || "—")}</Text>
          {l.link || a.portalLink ? (
            <PdfLink src={(l.link ?? a.portalLink)!} style={styles.loginLink}>
              {t(l.link ?? a.portalLink)}
            </PdfLink>
          ) : null}
          {l.updatedAt ? <Text style={[styles.loginKey, { marginLeft: 10 }]}>{t(`updated ${dayOf(l.updatedAt)}`)}</Text> : null}
        </View>
      ))}
      {a.logins.length === 0 ? <Text style={styles.noLogin}>{t(`No portal login saved${a.portalLink ? ` · apply at ${a.portalLink}` : ""}`)}</Text> : null}
    </View>
  );
}

/** One student, on pages of their own, flat. With `head` it is the whole document, for one student. */
function StudentPages({ s, data, head = false }: { s: AppReportStudent; data: ApplicationsPdfData; head?: boolean }) {
  const rows: ReactNode[] = [
    ...(head ? [<Head key="head" data={data} />] : []),
    <View key="band" style={styles.band} wrap={false}>
      <View style={styles.bandLeft}>
        <Text style={styles.bandName}>{t(s.name)}</Text>
        <Text style={styles.bandCode}>{t(s.code ?? "No Student ID yet")}</Text>
      </View>
      <View style={styles.bandRight}>
        <Text style={styles.bandBig}>{`${s.counts.total} application${s.counts.total === 1 ? "" : "s"}`}</Text>
        <Text style={styles.bandSub}>
          {s.counts.total ? `${s.counts.accepted} at an offer or later · ${s.counts.withLogin} with a login saved` : "None yet"}
        </Text>
      </View>
    </View>,
    <View key="facts" style={styles.facts}>
      <Fact label="Destination" value={s.countries.join(", ")} />
      <Fact label="Intake" value={s.intake} />
      <Fact label="Processing officer" value={s.officer ?? "Not assigned"} />
    </View>,
  ];
  if (s.counts.total) rows.push(<CountLine key="counts" c={s.counts} />);
  if (s.applications.length < s.allApplications) {
    rows.push(
      <Text key="filtered" style={styles.note}>
        {t(`Showing ${s.applications.length} of their ${s.allApplications} applications — the rest are left out by the filters.`)}
      </Text>
    );
  }
  if (s.allApplications === 0) {
    rows.push(
      <Text key="none" style={styles.empty}>
        No application has been made for this student yet.
      </Text>
    );
  }
  s.applications.forEach((a) => rows.push(<ApplicationRow key={a.id} a={a} />));
  return (
    <Page size="A4" style={styles.page}>
      {Footer({ data })}
      <View id={`s-${s.id}`}>{rows}</View>
    </Page>
  );
}

// ------------------------------------------------------------------ the document

export function ApplicationsReportDocument({ data }: { data: ApplicationsPdfData }) {
  const { report } = data;
  const tt = report.totals;
  const meta = { author: "HMARK Consultants", creator: "HMARK Student Portal", subject: "Applications and portal logins — confidential" };
  if (report.students.length === 1) {
    const only = report.students[0];
    return (
      <Document title={t(`Applications & portal logins — ${only.name}`)} {...meta}>
        <StudentPages s={only} data={data} head />
      </Document>
    );
  }
  return (
    <Document title="Applications & portal logins" {...meta}>
      <Page size="A4" style={styles.page}>
        {Footer({ data })}
        <View>
          <Head data={data} />
          <View style={styles.kpis}>
            <Kpi label="Students" value={String(tt.students)} sub={`${tt.withApplications} with applications`} color={BRAND} />
            <View style={styles.kpiGap} />
            <Kpi label="Applications" value={String(tt.total)} sub={tt.withApplications ? `${Math.round(tt.total / tt.withApplications)} per student who has any` : null} color={GREY} />
            <View style={styles.kpiGap} />
            <Kpi label={GROUP_LABELS.progress} value={String(tt.progress)} sub="Still running" color={GROUP_COLORS.progress} />
            <View style={styles.kpiGap} />
            <Kpi label={GROUP_LABELS.accepted} value={String(tt.accepted)} sub="Offer, acceptance or later" color={GROUP_COLORS.accepted} />
            <View style={styles.kpiGap} />
            <Kpi label="Logins saved" value={String(tt.withLogin)} sub={`of ${tt.total} applications`} color="#D97706" />
          </View>
          <View style={styles.legend}>
            {GROUPS.map((g) => (
              <View key={g} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: GROUP_COLORS[g] }]} />
                <Text style={styles.legendText}>{GROUP_LABELS[g]}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.h2}>{`Students (${tt.students})`}</Text>
          <View style={styles.tHead}>
            <Text style={[styles.th, styles.cNum]}>#</Text>
            <Text style={[styles.th, styles.cStudent]}>Student</Text>
            <Text style={[styles.th, styles.cDest]}>Destination</Text>
            <Text style={[styles.th, styles.cOfficer]}>Officer</Text>
            <Text style={[styles.th, styles.cCount]}>Apps</Text>
            <Text style={[styles.th, styles.cCount]}>Running</Text>
            <Text style={[styles.th, styles.cCount]}>Offers</Text>
            <Text style={[styles.th, styles.cCount]}>Ended</Text>
            <Text style={[styles.th, styles.cCount, { flex: 1 }]}>Logins</Text>
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
