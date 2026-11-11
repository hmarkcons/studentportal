import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { BRAND_LOGO_DATA_URI, BRAND_LOGO_RATIO } from "./brandLogo";
import { pdfSafe } from "../studentReport";

// An email campaign's results on one or two pages, to pass to management or
// print: what it was, how many it reached and what they did, the links they
// clicked, where it was read, and what happened on the website. Laid out as
// the other reports are: standard Helvetica through pdfSafe, flat rows.

Font.registerHyphenationCallback((word) => [word]);

const INK = "#1F2937";
const SOFT = "#4B5563";
const GREY = "#6B7280";
const RULE = "#E5E7EB";
const PANEL = "#F8FAFC";
const BRAND = "#0369A1";
const GOOD = "#15803D";
const BAD = "#B91C1C";

const t = (v: string | null | undefined) => pdfSafe(v);

const styles = StyleSheet.create({
  page: { paddingHorizontal: 36, paddingTop: 30, paddingBottom: 48, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { height: 34, width: 34 * BRAND_LOGO_RATIO },
  headRight: { alignItems: "flex-end", maxWidth: 340 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 0.4, color: INK, lineHeight: 1.1 },
  practice: { fontFamily: "Helvetica-Bold", fontSize: 7.6, color: "#B45309", marginTop: 4, letterSpacing: 0.4 },
  prepared: { fontSize: 7.5, color: GREY, marginTop: 3, textAlign: "right", lineHeight: 1.3 },
  strip: { height: 4, marginTop: 10, marginBottom: 12, backgroundColor: BRAND },

  name: { fontFamily: "Helvetica-Bold", fontSize: 12.5, color: INK, lineHeight: 1.2 },
  facts: { flexDirection: "row", flexWrap: "wrap", marginTop: 5, marginBottom: 6 },
  fact: { width: "25%", paddingRight: 8, marginBottom: 4 },
  factKey: { fontSize: 6.6, color: GREY, textTransform: "uppercase", letterSpacing: 0.4 },
  factVal: { fontSize: 8.4, color: INK, lineHeight: 1.3 },

  kpis: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  kpi: { width: "19%", marginRight: "1%", marginBottom: 6, borderWidth: 1, borderColor: RULE, borderTopWidth: 3, borderTopColor: BRAND, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 7, backgroundColor: PANEL },
  kpiLabel: { fontSize: 6.4, color: GREY, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 15, color: INK, marginTop: 3, lineHeight: 1 },
  kpiSub: { fontSize: 6.8, color: SOFT, marginTop: 3, lineHeight: 1.25 },
  note: { fontSize: 7.4, color: GREY, fontFamily: "Helvetica-Oblique", marginTop: 2, lineHeight: 1.3 },

  h2: { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: INK, marginTop: 12, marginBottom: 5 },
  cols: { flexDirection: "row" },
  col: { flex: 1 },
  colGap: { width: 14 },
  tHead: { flexDirection: "row", backgroundColor: "#F1F5F9", borderBottomWidth: 1, borderBottomColor: RULE, paddingVertical: 3.5, paddingHorizontal: 4 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 6.6, color: SOFT, textTransform: "uppercase", letterSpacing: 0.3 },
  tRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3.2, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  cKey: { flex: 1, paddingRight: 6, fontSize: 7.8, color: INK, lineHeight: 1.25 },
  cSub: { fontSize: 6.8, color: GREY },
  cNum: { width: 52, textAlign: "right", fontSize: 7.8, color: INK },
  empty: { fontSize: 7.8, color: GREY, paddingVertical: 6, fontFamily: "Helvetica-Oblique" },
  barBack: { height: 3, backgroundColor: "#E0F2FE", marginTop: 2, borderRadius: 1.5 },
  bar: { height: 3, backgroundColor: BRAND, borderRadius: 1.5 },

  footRule: { position: "absolute", left: 36, right: 36, bottom: 32, height: 0.5, backgroundColor: RULE },
  footLeft: { position: "absolute", left: 36, right: 130, bottom: 20, fontSize: 7, color: GREY },
  footRight: { position: "absolute", left: 36, right: 36, bottom: 20, textAlign: "right", fontSize: 7, color: GREY },
});

export type PdfRow = { key: string; sub?: string; value: number; cells: string[] };

export type EmailCampaignPdfData = {
  name: string;
  subject: string;
  practice: boolean;
  from: string;
  started: string;
  finished: string;
  preparedOn: string;
  preparedBy: string | null;
  kpis: { label: string; value: string; sub?: string }[];
  machineNote: string | null;
  comparison: { label: string; value: string; average: string; points: string; good: boolean | null }[];
  comparedWith: string;
  links: PdfRow[];
  bounces: PdfRow[];
  clients: PdfRow[];
  countries: PdfRow[];
  domains: PdfRow[];
  pages: PdfRow[];
  conversions: PdfRow[];
};

function Table({ title, columns, rows, empty }: { title: string; columns: string[]; rows: PdfRow[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View wrap={false}>
      <Text style={styles.h2}>{t(title)}</Text>
      <View style={styles.tHead}>
        <Text style={[styles.th, { flex: 1 }]}>{t(columns[0])}</Text>
        {columns.slice(1).map((c) => (
          <Text key={c} style={[styles.th, { width: 52, textAlign: "right" }]}>
            {t(c)}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{t(empty)}</Text>
      ) : (
        rows.map((r, i) => (
          <View key={`${r.key}-${i}`} style={styles.tRow}>
            <View style={{ flex: 1, paddingRight: 6 }}>
              <Text style={styles.cKey}>{t(r.key)}</Text>
              {r.sub ? <Text style={styles.cSub}>{t(r.sub)}</Text> : null}
              <View style={styles.barBack}>
                <View style={[styles.bar, { width: `${Math.max(2, (r.value / max) * 100)}%` }]} />
              </View>
            </View>
            {r.cells.map((c, j) => (
              <Text key={j} style={styles.cNum}>
                {t(c)}
              </Text>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

export function EmailCampaignReportDocument({ data }: { data: EmailCampaignPdfData }) {
  const prepared = `Prepared ${data.preparedOn}${data.preparedBy ? ` by ${data.preparedBy}` : ""}`;
  return (
    <Document title={t(`Email campaign report — ${data.name}`)} author="HMARK Consultants">
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          <Image src={BRAND_LOGO_DATA_URI} style={styles.logo} />
          <View style={styles.headRight}>
            <Text style={styles.title}>EMAIL CAMPAIGN REPORT</Text>
            {data.practice ? <Text style={styles.practice}>PRACTICE RUN — NOTHING WAS SENT; ACTIVITY IS SIMULATED</Text> : null}
            <Text style={styles.prepared}>{t(prepared)}</Text>
          </View>
        </View>
        <View style={styles.strip} />

        <Text style={styles.name}>{t(data.name)}</Text>
        <View style={styles.facts}>
          {[
            ["Subject", data.subject],
            ["From", data.from],
            ["Started", data.started],
            ["Finished", data.finished],
          ].map(([k, v]) => (
            <View key={k} style={styles.fact}>
              <Text style={styles.factKey}>{t(k)}</Text>
              <Text style={styles.factVal}>{t(v)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.kpis}>
          {data.kpis.map((k) => (
            <View key={k.label} style={styles.kpi}>
              <Text style={styles.kpiLabel}>{t(k.label)}</Text>
              <Text style={styles.kpiValue}>{t(k.value)}</Text>
              {k.sub ? <Text style={styles.kpiSub}>{t(k.sub)}</Text> : null}
            </View>
          ))}
        </View>
        {data.machineNote ? <Text style={styles.note}>{t(data.machineNote)}</Text> : null}

        <View wrap={false}>
          <Text style={styles.h2}>Compared with earlier campaigns</Text>
          <Text style={styles.note}>{t(data.comparedWith)}</Text>
          <View style={[styles.tHead, { marginTop: 4 }]}>
            <Text style={[styles.th, { flex: 1 }]}> </Text>
            {["This one", "Earlier", "Difference"].map((c) => (
              <Text key={c} style={[styles.th, { width: 70, textAlign: "right" }]}>
                {c}
              </Text>
            ))}
          </View>
          {data.comparison.map((r) => (
            <View key={r.label} style={styles.tRow}>
              <Text style={styles.cKey}>{t(r.label)}</Text>
              <Text style={[styles.cNum, { width: 70 }]}>{t(r.value)}</Text>
              <Text style={[styles.cNum, { width: 70, color: GREY }]}>{t(r.average)}</Text>
              <Text style={[styles.cNum, { width: 70, color: r.good === null ? GREY : r.good ? GOOD : BAD }]}>{t(r.points)}</Text>
            </View>
          ))}
        </View>

        <Table title="The links people clicked" columns={["Link", "People", "Share"]} rows={data.links} empty="It had no tracked links, or nobody clicked." />

        <View style={styles.cols}>
          <View style={styles.col}>
            <Table title="Mail apps (of people who opened)" columns={["App", "People", "Share"]} rows={data.clients} empty="Nobody has opened it yet." />
            <Table title="Countries (of people who opened)" columns={["Country", "People", "Share"]} rows={data.countries} empty="Nobody has opened it yet." />
          </View>
          <View style={styles.colGap} />
          <View style={styles.col}>
            <Table title="Email providers" columns={["Domain", "Sent", "Opened"]} rows={data.domains} empty="Nothing sent." />
            <Table title="Why emails bounced" columns={["Reason", "Emails"]} rows={data.bounces} empty="Nothing bounced." />
          </View>
        </View>

        <View style={styles.cols}>
          <View style={styles.col}>
            <Table title="Website pages they saw" columns={["Page", "Views", "People"]} rows={data.pages} empty="No website visits recorded." />
          </View>
          <View style={styles.colGap} />
          <View style={styles.col}>
            <Table title="What they did on the website" columns={["Conversion", "Times", "People"]} rows={data.conversions} empty="No conversions recorded." />
          </View>
        </View>

        <View style={styles.footRule} fixed />
        <Text style={styles.footLeft} fixed>
          {t(`HMARK Consultants · Email campaign report · ${data.name} · ${prepared}`)}
        </Text>
        <Text style={styles.footRight} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}
