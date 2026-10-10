import { Document, Page, Text, View, Image, Link as PdfLink, StyleSheet, Font, Svg, Path, Circle, type Styles } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { BRAND_LOGO_DATA_URI, BRAND_LOGO_RATIO } from "./brandLogo";
import {
  REPORT_STATUSES,
  SECTION_COLORS,
  STATUS_COLORS,
  STATUS_LABELS,
  countStatuses,
  day,
  pdfSafe,
  type FlaggedItem,
  type ReportFacts,
  type ReportItem,
  type ReportSection,
  type ReportStatus,
  type StatusCounts,
} from "../studentReport";
import type { StudentReportData, TeamLine } from "../studentReportLoad";

// A status report for one student: a first page that says where everything
// stands at a glance — the student, how much is done, one bar per section,
// what needs attention and what is coming up — and then every section in
// full, each item with a chip in its status colour.
//
// The standard Helvetica, as the invoice uses: nothing to embed, so the file
// is small and quick, and its words can be read back out by the checks. Every
// string goes through pdfSafe for the letters Helvetica cannot draw.

// Never break a word across lines: a hyphenated name reads as a typo.
Font.registerHyphenationCallback((word) => [word]);

const INK = "#1F2937";
const SOFT = "#4B5563";
const GREY = "#6B7280";
const RULE = "#E5E7EB";
const PANEL = "#F8FAFC";
const TRACK = "#E5E7EB";

type Style = Styles[string];

const t = (v: string | null | undefined) => pdfSafe(v);

const styles = StyleSheet.create({
  // No lineHeight here, nor on any View: inherited by the page number, it is
  // drawn out of sight, and set on a View it doubles every line. Each text
  // that wraps sets its own.
  page: { paddingHorizontal: 36, paddingTop: 30, paddingBottom: 48, fontSize: 9, color: INK, fontFamily: "Helvetica" },

  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { height: 34, width: 34 * BRAND_LOGO_RATIO },
  headRight: { alignItems: "flex-end" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 16, letterSpacing: 0.4, color: INK, lineHeight: 1.1 },
  prepared: { fontSize: 7.5, color: GREY, marginTop: 4 },
  strip: { flexDirection: "row", height: 4, marginTop: 10, marginBottom: 12 },

  card: { flexDirection: "row", backgroundColor: PANEL, borderWidth: 1, borderColor: RULE, borderRadius: 6, padding: 12 },
  cardMain: { flex: 1, paddingRight: 12 },
  name: { fontFamily: "Helvetica-Bold", fontSize: 17, color: INK, lineHeight: 1.15 },
  code: { fontFamily: "Courier-Bold", fontSize: 10, color: SECTION_COLORS.registration, marginTop: 3 },
  codeOld: { fontFamily: "Helvetica", fontSize: 7.5, color: GREY },
  noCode: { fontSize: 8.5, color: STATUS_COLORS.todo, marginTop: 3 },
  facts: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  fact: { width: "50%", paddingRight: 8, marginBottom: 5 },
  factKey: { fontSize: 6.8, color: GREY, textTransform: "uppercase", letterSpacing: 0.4 },
  factVal: { fontSize: 8.6, color: INK, lineHeight: 1.3 },
  factSub: { fontSize: 7.4, color: SOFT, lineHeight: 1.3 },

  ringBox: { width: 132, alignItems: "center", justifyContent: "flex-start", borderLeftWidth: 1, borderLeftColor: RULE, paddingLeft: 12 },
  ringWrap: { width: 104, height: 104, position: "relative" },
  ringCentre: { position: "absolute", top: 0, left: 0, width: 104, height: 104, alignItems: "center", justifyContent: "center" },
  ringPct: { fontFamily: "Helvetica-Bold", fontSize: 21, color: INK, lineHeight: 1 },
  ringSub: { fontSize: 6.8, color: GREY, marginTop: 2 },
  ringCaption: { fontSize: 7.5, color: SOFT, marginTop: 6, textAlign: "center" },
  miniLegend: { marginTop: 6, width: "100%" },
  miniRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5 },
  miniText: { fontSize: 7.4, color: SOFT, flex: 1 },
  miniNum: { fontSize: 7.4, fontFamily: "Helvetica-Bold", color: INK },

  h2: { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: INK, marginTop: 14, marginBottom: 6 },
  chartRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3.2, borderBottomWidth: 0.5, borderBottomColor: RULE },
  chartName: { width: 150, flexDirection: "row", alignItems: "center" },
  swatch: { width: 9, height: 9, borderRadius: 2, marginRight: 6 },
  chartLabel: { fontSize: 8.4, fontFamily: "Helvetica-Bold" },
  bar: { flex: 1, height: 9, flexDirection: "row", backgroundColor: TRACK, borderRadius: 2 },
  chartNum: { width: 84, textAlign: "right", fontSize: 7.8, color: SOFT },

  legend: { flexDirection: "row", flexWrap: "wrap", marginTop: 7 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 2 },
  legendText: { fontSize: 7.4, color: SOFT },

  boxes: { flexDirection: "row", marginTop: 12 },
  box: { flex: 1, borderWidth: 1, borderColor: RULE, borderTopWidth: 3, borderRadius: 4, padding: 8 },
  boxTitle: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 4 },
  boxRow: { flexDirection: "row", marginBottom: 3 },
  boxDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 3, marginRight: 5 },
  boxText: { flex: 1, fontSize: 7.6, color: INK, lineHeight: 1.3 },
  boxSub: { color: GREY },
  boxEmpty: { fontSize: 7.6, color: GREY },
  withheld: { fontSize: 7.4, color: GREY, marginTop: 10, fontFamily: "Helvetica-Oblique" },

  band: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 12,
  },
  bandTitle: { fontFamily: "Helvetica-Bold", fontSize: 11.5, color: "#FFFFFF" },
  bandCounts: { fontSize: 7.6, color: "#FFFFFF" },
  sectionBar: { height: 4, flexDirection: "row", backgroundColor: TRACK, marginTop: 3, marginBottom: 4, borderRadius: 2 },
  note: { fontSize: 7.8, color: GREY, fontFamily: "Helvetica-Oblique", marginBottom: 4, marginTop: 1, lineHeight: 1.3 },

  factsBox: { borderWidth: 1, borderColor: RULE, borderRadius: 4, marginTop: 5, marginBottom: 4 },
  factsTitle: { fontFamily: "Helvetica-Bold", fontSize: 8.4, paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: RULE },
  factsRow: { flexDirection: "row", paddingVertical: 2.6, paddingHorizontal: 8 },
  factsKey: { flex: 1, fontSize: 8.2, color: SOFT },
  factsVal: { width: 140, textAlign: "right", fontSize: 8.2, color: INK },
  factsStrong: { fontFamily: "Helvetica-Bold", color: INK },

  group: { fontFamily: "Helvetica-Bold", fontSize: 8.2, marginTop: 7, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3.4,
    paddingLeft: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
  },
  chip: { width: 84, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 3, marginRight: 8, marginTop: 0.5 },
  chipText: { fontFamily: "Helvetica-Bold", fontSize: 6.8, color: "#FFFFFF", textAlign: "center", lineHeight: 1.2 },
  rowBody: { flex: 1, paddingRight: 8 },
  rowLabel: { fontFamily: "Helvetica-Bold", fontSize: 8.6, color: INK, lineHeight: 1.3 },
  rowDetail: { fontSize: 7.8, color: SOFT, marginTop: 1, lineHeight: 1.3 },
  rowStamp: { width: 165, fontSize: 7.2, color: GREY, textAlign: "right", marginTop: 0.5, lineHeight: 1.3 },
  empty: { fontSize: 8, color: GREY, paddingVertical: 4 },

  remark: { borderWidth: 1, borderColor: RULE, borderLeftWidth: 3, borderRadius: 3, padding: 7, marginTop: 6 },
  remarkHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  remarkAbout: { fontFamily: "Helvetica-Bold", fontSize: 8.6 },
  remarkStamp: { fontSize: 7.2, color: GREY },
  remarkBody: { fontSize: 8.4, color: INK, lineHeight: 1.45 },

  // A width of its own: a page number drawn without one is measured as nothing, and not drawn.
  footRule: { position: "absolute", left: 36, right: 36, bottom: 32, height: 0.5, backgroundColor: RULE },
  footLeft: { position: "absolute", left: 36, right: 130, bottom: 20, fontSize: 7, color: GREY },
  footRight: { position: "absolute", left: 36, right: 36, bottom: 20, textAlign: "right", fontSize: 7, color: GREY },
});

// ------------------------------------------------------------------ pieces

const COUNTED: ReportStatus[] = ["done", "progress", "todo", "blocked"];

/** A bar in the statuses' colours, each part as long as its share. "Not needed" only when that is all there is. */
function StatusBar({ counts, style }: { counts: StatusCounts; style: Style }) {
  const needed = COUNTED.reduce((n, s) => n + counts[s], 0);
  const parts = needed > 0 ? COUNTED.filter((s) => counts[s] > 0) : counts.na > 0 ? (["na"] as ReportStatus[]) : [];
  return (
    <View style={style}>
      {parts.map((s) => (
        <View
          key={s}
          style={{
            flexGrow: counts[s],
            flexBasis: 0,
            backgroundColor: STATUS_COLORS[s],
          }}
        />
      ))}
    </View>
  );
}

/** The share of what is needed that is done, as a ring in the four colours. */
function Ring({ counts, percent }: { counts: StatusCounts; percent: number }) {
  const size = 104;
  const c = size / 2;
  const r = 40;
  const needed = COUNTED.reduce((n, s) => n + counts[s], 0);
  const arcs: { status: ReportStatus; from: number; to: number }[] = [];
  let at = 0;
  for (const s of COUNTED) {
    if (!counts[s] || !needed) continue;
    const share = counts[s] / needed;
    arcs.push({ status: s, from: at, to: at + share });
    at += share;
  }
  const point = (turn: number) => {
    const a = turn * 2 * Math.PI - Math.PI / 2;
    return `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  };
  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={c} cy={c} r={r} stroke={TRACK} strokeWidth={13} fill="none" />
        {arcs.map((arc) =>
          arc.to - arc.from > 0.9999 ? (
            <Circle key={arc.status} cx={c} cy={c} r={r} stroke={STATUS_COLORS[arc.status]} strokeWidth={13} fill="none" />
          ) : (
            <Path
              key={arc.status}
              d={`M ${point(arc.from)} A ${r} ${r} 0 ${arc.to - arc.from > 0.5 ? 1 : 0} 1 ${point(arc.to)}`}
              stroke={STATUS_COLORS[arc.status]}
              strokeWidth={13}
              fill="none"
            />
          ),
        )}
      </Svg>
      <View style={styles.ringCentre}>
        <Text style={styles.ringPct}>{percent}%</Text>
        <Text style={styles.ringSub}>done</Text>
      </View>
    </View>
  );
}

function Fact({ label, value, sub }: { label: string; value: string | null | undefined; sub?: string | null }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factKey}>{label}</Text>
      <Text style={styles.factVal}>{t(value || "—")}</Text>
      {sub ? <Text style={styles.factSub}>{t(sub)}</Text> : null}
    </View>
  );
}

const teamSub = (p: TeamLine | null) => (p ? [p.designation, p.phone, p.email].filter(Boolean).join(" · ") || null : null);

function Flagged({ items, empty, accent, title }: { items: FlaggedItem[]; empty: string; accent: string; title: string }) {
  return (
    <View style={[styles.box, { borderTopColor: accent }]}>
      <Text style={[styles.boxTitle, { color: accent }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.boxEmpty}>{empty}</Text>
      ) : (
        items.map((i, n) => (
          <View key={n} style={styles.boxRow} wrap={false}>
            <View style={[styles.boxDot, { backgroundColor: STATUS_COLORS[i.status] }]} />
            <Text style={styles.boxText}>
              {t(i.label)} — {t(i.state)}
              {i.due ? ` (${day(i.due)})` : ""}
              <Text style={styles.boxSub}> · {t(i.section)}</Text>
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function FactsTable({ facts, color }: { facts: ReportFacts; color: string }) {
  return (
    <View style={styles.factsBox} wrap={false}>
      <Text style={[styles.factsTitle, { color }]}>{t(facts.title)}</Text>
      {facts.rows.map((r, i) => (
        <View key={i} style={[styles.factsRow, i % 2 === 1 ? { backgroundColor: PANEL } : {}, r.strong ? { borderTopWidth: 0.5, borderTopColor: RULE } : {}]}>
          <Text style={[styles.factsKey, r.strong ? styles.factsStrong : {}]}>{t(r.label)}</Text>
          <Text style={[styles.factsVal, r.strong ? styles.factsStrong : {}]}>{t(r.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function ItemRow({ item, color }: { item: ReportItem; color: string }) {
  return (
    <View style={[styles.row, { borderLeftColor: color }]} wrap={false}>
      <View style={[styles.chip, { backgroundColor: STATUS_COLORS[item.status] }]}>
        <Text style={styles.chipText}>{t(item.state)}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{t(item.label)}</Text>
        {item.detail ? <Text style={styles.rowDetail}>{t(item.detail)}</Text> : null}
      </View>
      <Text style={styles.rowStamp}>{t(item.stamp ?? "")}</Text>
    </View>
  );
}

/** Items under their group headings, in the order the groups first appear. */
function grouped(items: readonly ReportItem[]) {
  const groups: { name: string; items: ReportItem[] }[] = [];
  for (const item of items) {
    const name = item.group ?? "";
    const g = groups.find((x) => x.name === name);
    if (g) g.items.push(item);
    else groups.push({ name, items: [item] });
  }
  return groups;
}

const countWords = (c: StatusCounts) =>
  [
    `${c.done} done`,
    c.progress ? `${c.progress} in progress` : null,
    c.todo ? `${c.todo} to do` : null,
    c.blocked ? `${c.blocked} sent back` : null,
    c.na ? `${c.na} not needed` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * A section as one flat run of rows — its band, then each group's heading,
 * figures and items — all siblings, so react-pdf can break the page between
 * any two of them. The band and each heading ask for room for what follows
 * them (minPresenceAhead), so neither ends a page on its own.
 *
 * Flat on purpose. Kept together in a block of their own, react-pdf piled the
 * block's rows on top of one another whenever it had to move it to the next
 * page; and a heading's minPresenceAhead is only honoured against siblings.
 */
function SectionBlock({ section }: { section: ReportSection }) {
  const color = SECTION_COLORS[section.key];
  const counts = countStatuses(section.items);
  const facts = section.facts ?? [];
  const groups = grouped(section.items);
  // Figures that belong to no group are said first.
  const loose = facts.filter((f) => !f.group || !groups.some((g) => g.name === f.group));
  const rows: ReactNode[] = [];
  rows.push(
    <View key="band" style={[styles.band, { backgroundColor: color }]} wrap={false} minPresenceAhead={90}>
      <Text style={styles.bandTitle}>{t(section.title)}</Text>
      <Text style={styles.bandCounts}>{section.items.length ? countWords(counts) : "Nothing to report"}</Text>
    </View>,
    <StatusBar key="bar" counts={counts} style={styles.sectionBar} />,
  );
  if (section.note)
    rows.push(
      <Text key="note" style={styles.note}>
        {t(section.note)}
      </Text>,
    );
  loose.forEach((f, i) => rows.push(<FactsTable key={`loose${i}`} facts={f} color={color} />));
  groups.forEach((g, gi) => {
    if (g.name) {
      rows.push(
        <Text key={`g${gi}`} style={[styles.group, { color }]} minPresenceAhead={40}>
          {t(g.name)}
        </Text>,
      );
    }
    facts.filter((f) => f.group && f.group === g.name).forEach((f, i) => rows.push(<FactsTable key={`g${gi}f${i}`} facts={f} color={color} />));
    g.items.forEach((item, n) => rows.push(<ItemRow key={`g${gi}i${n}`} item={item} color={color} />));
  });
  if (section.items.length === 0 && !section.note && loose.length === 0)
    rows.push(
      <Text key="empty" style={styles.empty}>
        Nothing on record.
      </Text>,
    );
  return <View id={section.key}>{rows}</View>;
}

/**
 * At the foot of every page: whose report, from whom, and which page.
 *
 * What react-pdf needs to draw a page number at all, learnt by trying: the
 * whole report is one Page (in a second Page the number is never drawn),
 * the number is a direct child of it, and nothing above it sets a
 * lineHeight — inherited, the number is written where it cannot be seen.
 */
function Footer({ data }: { data: StudentReportData }) {
  return [
    <View key="rule" style={styles.footRule} fixed />,
    <Text key="text" style={styles.footLeft} fixed>
      {t(
        `HMARK Consultants · ${data.student.name}${data.student.code ? ` · ${data.student.code}` : ""} · prepared ${data.preparedAt} by ${data.preparedBy} · internal`,
      )}
    </Text>,
    <Text key="page" style={styles.footRight} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />,
  ];
}

// ------------------------------------------------------------------ the document

export function StudentReportDocument({ data }: { data: StudentReportData }) {
  const s = data.student;
  const { summary } = data;
  const sectionColors = Object.values(SECTION_COLORS);
  return (
    <Document title={t(`Status report — ${s.name}`)} author="HMARK Consultants" subject="Student status report" creator="HMARK Student Portal">
      <Page size="A4" style={styles.page}>
        {Footer({ data })}
        <View>
          <View style={styles.head}>
            <Image src={BRAND_LOGO_DATA_URI} style={styles.logo} />
            <View style={styles.headRight}>
              <Text style={styles.title}>STUDENT STATUS REPORT</Text>
              <Text style={styles.prepared}>{t(`Prepared ${data.preparedAt} by ${data.preparedBy}`)}</Text>
            </View>
          </View>
          <View style={styles.strip}>
            {sectionColors.map((c) => (
              <View key={c} style={{ flex: 1, backgroundColor: c }} />
            ))}
          </View>

          <View style={styles.card}>
            <View style={styles.cardMain}>
              <Text style={styles.name}>{t(s.name)}</Text>
              {s.code ? (
                <Text style={styles.code}>
                  {t(s.code)}
                  {s.legacyCodes.length ? <Text style={styles.codeOld}>{t(`   previously ${s.legacyCodes.join(", ")}`)}</Text> : null}
                </Text>
              ) : (
                <Text style={styles.noCode}>
                  No Student ID yet
                  {s.intake ? " — no country on file" : " — no intake recorded"}
                </Text>
              )}
              <View style={styles.facts}>
                <Fact
                  label="Intake"
                  value={s.intake}
                  sub={s.previousIntakes ? `${s.previousIntakes} earlier intake${s.previousIntakes === 1 ? "" : "s"} on file` : null}
                />
                <Fact label="Service" value={s.service} />
                <Fact label="Destination" value={s.primary} sub={s.backups.length ? `Backup: ${s.backups.join(", ")}` : null} />
                <Fact label="Registration" value={s.registration} sub={s.registeredOn ? `Registered ${s.registeredOn}` : null} />
                <Fact label="University finalized" value={s.finalized ?? "Not yet"} />
                <Fact label="Contact" value={s.phone} sub={s.email} />
                <Fact label="Counsellor" value={s.counsellor?.name ?? "Not assigned"} sub={teamSub(s.counsellor)} />
                <Fact label="Processing officer" value={s.officer?.name ?? "The processing team"} sub={teamSub(s.officer)} />
              </View>
            </View>
            <View style={styles.ringBox}>
              <Ring counts={summary.overall.counts} percent={summary.overall.percent} />
              <Text style={styles.ringCaption}>
                {summary.overall.counts.done} of {summary.overall.needed} items done
              </Text>
              <View style={styles.miniLegend}>
                {REPORT_STATUSES.map((st) => (
                  <View key={st} style={styles.miniRow}>
                    <View style={[styles.dot, { backgroundColor: STATUS_COLORS[st] }]} />
                    <Text style={styles.miniText}>{STATUS_LABELS[st]}</Text>
                    <Text style={styles.miniNum}>{summary.overall.counts[st]}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <Text style={styles.h2}>Progress by section</Text>
          {summary.sections.map((sec) => (
            <PdfLink key={sec.key} src={`#${sec.key}`} style={{ textDecoration: "none", color: INK }}>
              <View style={styles.chartRow}>
                <View style={styles.chartName}>
                  <View style={[styles.swatch, { backgroundColor: sec.color }]} />
                  <Text style={[styles.chartLabel, { color: sec.color }]}>{t(sec.title)}</Text>
                </View>
                <StatusBar counts={sec.counts} style={styles.bar} />
                <Text style={styles.chartNum}>{sec.needed ? `${sec.counts.done} of ${sec.needed} · ${sec.percent}%` : "Not needed yet"}</Text>
              </View>
            </PdfLink>
          ))}
          <View style={styles.legend}>
            {REPORT_STATUSES.map((st) => (
              <View key={st} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: STATUS_COLORS[st] }]} />
                <Text style={styles.legendText}>{STATUS_LABELS[st]}</Text>
              </View>
            ))}
          </View>

          <View style={styles.boxes}>
            <Flagged title="Needs attention" accent={STATUS_COLORS.blocked} items={summary.attention} empty="Nothing sent back, refused or overdue." />
            <View style={{ width: 10 }} />
            <Flagged
              title="Coming up — next six weeks"
              accent={STATUS_COLORS.progress}
              items={summary.upcoming}
              empty="Nothing falls due in the next six weeks."
            />
          </View>
          {data.withheld ? <Text style={styles.withheld}>{t(data.withheld)}</Text> : null}
        </View>

        {/* Every section in full, from a page of their own. */}
        <View break>
          {data.sections.map((section) => (
            <SectionBlock key={section.key} section={section} />
          ))}

          {/* Flat, as a section is: the band and then each remark, siblings. */}
          <View id="remarks">
            <View style={[styles.band, { backgroundColor: SECTION_COLORS.remarks }]} wrap={false} minPresenceAhead={60}>
              <Text style={styles.bandTitle}>Internal remarks</Text>
              <Text style={styles.bandCounts}>Staff only — never shown to the student</Text>
            </View>
            {data.remarks.length === 0 ? <Text style={styles.empty}>No remarks on record.</Text> : null}
            {data.remarks.map((r, i) => (
              // A long remark may run onto the next page rather than overflow this one.
              <View key={i} style={[styles.remark, { borderLeftColor: SECTION_COLORS.remarks }]} wrap={r.body.length > 1500}>
                <View style={styles.remarkHead}>
                  <Text style={styles.remarkAbout}>{t(r.about)}</Text>
                  <Text style={styles.remarkStamp}>{t(r.stamp ?? "")}</Text>
                </View>
                <Text style={styles.remarkBody}>{t(r.body)}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}
