// A table report (src/lib/reports/tableReport.ts) as a landscape A4 PDF: the
// HMARK header, the filters and the summary figures, then the table, its
// header repeated on every page, rows grouped under a band where the report
// groups them. Helvetica, as the other reports; pdfSafe keeps out what it
// cannot draw.
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { BRAND_LOGO_DATA_URI, BRAND_LOGO_RATIO } from "./brandLogo";
import { pdfSafe } from "../studentReport";
import { TONE_COLOURS, type TableReport } from "../reports/tableReport";

Font.registerHyphenationCallback((word) => [word]);

const INK = "#1F2937";
const SOFT = "#4B5563";
const GREY = "#6B7280";
const RULE = "#E5E7EB";
const PANEL = "#F8FAFC";
const BRAND = "#0369A1";

const t = (v: string | null | undefined) => pdfSafe(v);

const styles = StyleSheet.create({
  page: { paddingHorizontal: 30, paddingTop: 28, paddingBottom: 44, fontSize: 8, color: INK, fontFamily: "Helvetica" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { height: 30, width: 30 * BRAND_LOGO_RATIO },
  headRight: { alignItems: "flex-end", maxWidth: 520 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 15, color: INK },
  filters: { fontSize: 8, color: SOFT, marginTop: 3, textAlign: "right" },
  prepared: { fontSize: 7, color: GREY, marginTop: 2, textAlign: "right" },
  strip: { height: 3, backgroundColor: BRAND, marginTop: 9, marginBottom: 10 },
  kpis: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  kpi: { borderWidth: 1, borderColor: RULE, borderTopWidth: 3, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: PANEL, marginRight: 6, marginBottom: 4, minWidth: 92 },
  kpiLabel: { fontSize: 6.4, color: GREY, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 13, color: INK, marginTop: 2 },
  tHead: { flexDirection: "row", backgroundColor: "#F1F5F9", borderBottomWidth: 1, borderBottomColor: RULE, paddingVertical: 4 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 6.6, color: SOFT, textTransform: "uppercase", letterSpacing: 0.3, paddingHorizontal: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 3 },
  td: { fontSize: 7.6, color: INK, paddingHorizontal: 3, lineHeight: 1.25 },
  band: { backgroundColor: BRAND, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 6, marginTop: 8, marginBottom: 2 },
  bandText: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#FFFFFF" },
  empty: { fontSize: 9, color: GREY, fontFamily: "Helvetica-Oblique", paddingVertical: 12 },
  note: { fontSize: 7.2, color: GREY, marginTop: 10, lineHeight: 1.35 },
  footRule: { position: "absolute", bottom: 30, left: 30, right: 30, height: 0.5, backgroundColor: RULE },
  footLeft: { position: "absolute", bottom: 18, left: 30, fontSize: 7, color: GREY },
  footRight: { position: "absolute", bottom: 18, right: 30, fontSize: 7, color: GREY },
});

export function TableReportDocument({ report }: { report: TableReport }) {
  const total = report.columns.reduce((n, c) => n + (c.width ?? 1), 0);
  const width = (w: number | undefined) => `${(((w ?? 1) / total) * 100).toFixed(3)}%`;
  const header = (
    <View style={styles.tHead} fixed>
      {report.columns.map((c) => (
        <Text key={c.key} style={{ ...styles.th, width: width(c.width), textAlign: c.align === "right" ? "right" : "left" }}>
          {t(c.header)}
        </Text>
      ))}
    </View>
  );

  const body: React.ReactElement[] = [];
  let group: string | undefined;
  report.rows.forEach((r, i) => {
    if (r.group !== undefined && r.group !== group) {
      group = r.group;
      body.push(
        <View key={`g${i}`} style={styles.band} minPresenceAhead={24} wrap={false}>
          <Text style={styles.bandText}>{t(r.group)}</Text>
        </View>
      );
    }
    const tone = r.tone ? TONE_COLOURS[r.tone] : null;
    body.push(
      <View key={`r${i}`} style={{ ...styles.row, backgroundColor: tone?.fill }} wrap={false}>
        {report.columns.map((c) => (
          <Text key={c.key} style={{ ...styles.td, width: width(c.width), textAlign: c.align === "right" ? "right" : "left", color: tone?.text ?? INK }}>
            {t(r.cells[c.key] ?? "")}
          </Text>
        ))}
      </View>
    );
  });

  return (
    <Document title={t(report.title)} author="HMARK Consultants">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.head}>
          <Image src={BRAND_LOGO_DATA_URI} style={styles.logo} />
          <View style={styles.headRight}>
            <Text style={styles.title}>{t(report.title)}</Text>
            <Text style={styles.filters}>{t(report.filters)}</Text>
            <Text style={styles.prepared}>
              Prepared {t(report.preparedOn)}
              {report.preparedBy ? ` by ${t(report.preparedBy)}` : ""}
            </Text>
          </View>
        </View>
        <View style={styles.strip} />
        {report.summary.length > 0 && (
          <View style={styles.kpis}>
            {report.summary.map((s) => (
              <View key={s.label} style={{ ...styles.kpi, borderTopColor: s.tone ? TONE_COLOURS[s.tone].text : BRAND }}>
                <Text style={styles.kpiLabel}>{t(s.label)}</Text>
                <Text style={styles.kpiValue}>{t(s.value)}</Text>
              </View>
            ))}
          </View>
        )}
        {report.rows.length === 0 ? (
          <Text style={styles.empty}>{t(report.empty)}</Text>
        ) : (
          <>
            {header}
            {body}
          </>
        )}
        {report.note && <Text style={styles.note}>{t(report.note)}</Text>}
        <View style={styles.footRule} fixed />
        <Text style={styles.footLeft} fixed>
          {t(`HMARK Consultants · ${report.title}`)}
        </Text>
        <Text style={styles.footRight} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}
