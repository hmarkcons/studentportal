"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ReportDownloadButton } from "@/components/reports/ReportDownloadButton";
import { deadlineProgrammeOptions, deadlineUniversityOptions } from "@/lib/actions/reportOptions";
import { LEVEL_LABELS, REPORT_FIELDS, type DeadlinesFilters, type ReportLevel } from "@/lib/reports/universityDeadlinesReport";

type Option = { value: string; label: string };
const HREF = "/reports/university-deadlines";

/**
 * The Universities and deadlines report's dropdowns, each depending on the one
 * before: Country, then University (all, or one of that country's), Level,
 * Field, then Programmes — No selection (the universities' deadlines), All,
 * or, once one university is chosen, any one of its programmes. Then the
 * report on screen, as PDF or as Excel.
 *
 * On a university's own page the country and university are that one's, and
 * only the rest is asked.
 */
export function DeadlinesReportPanel({
  countries,
  initial,
  universities: firstUniversities,
  programmes: firstProgrammes,
  lockUniversity = false,
  onReportPage = false,
  title,
  description,
}: {
  countries: Option[];
  initial: DeadlinesFilters;
  /** The initial country's universities. */
  universities: Option[];
  /** The initial university's programmes. */
  programmes: Option[];
  /** On a university's page: its country and university are fixed. */
  lockUniversity?: boolean;
  onReportPage?: boolean;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [f, setF] = useState<DeadlinesFilters>(initial);
  const [universities, setUniversities] = useState<Option[]>(firstUniversities);
  const [programmes, setProgrammes] = useState<Option[]>(firstProgrammes);
  const [loading, setLoading] = useState(false);

  async function chooseCountry(country: string) {
    setF((x) => ({ ...x, country, university: "", programme: x.programme === "all" ? "all" : "" }));
    setProgrammes([]);
    setUniversities([]);
    if (!country) return;
    setLoading(true);
    try {
      setUniversities(await deadlineUniversityOptions(country));
    } finally {
      setLoading(false);
    }
  }

  async function chooseUniversity(university: string) {
    setF((x) => ({ ...x, university, programme: x.programme === "all" ? "all" : "" }));
    setProgrammes([]);
    if (!university) return;
    setLoading(true);
    try {
      setProgrammes(await deadlineProgrammeOptions(university));
    } finally {
      setLoading(false);
    }
  }

  const query = new URLSearchParams();
  if (f.country) query.set("country", f.country);
  if (f.university) query.set("university", f.university);
  if (f.level !== "all") query.set("level", f.level);
  if (f.field) query.set("field", f.field);
  if (f.programme) query.set("programme", f.programme);
  const qs = query.toString();
  const ready = Boolean(f.country);
  const programmeOptions: Option[] = [
    { value: "", label: "No selection — the universities' deadlines" },
    { value: "all", label: "All programmes" },
    ...(f.university ? programmes : []),
  ];

  const field = (label: string, name: string, value: string, options: Option[], onChange: (v: string) => void) => (
    <label className="flex min-w-48 flex-col gap-1 text-xs text-muted">
      {label}
      <Select name={name} value={value} onChange={(e) => onChange(e.target.value)} disabled={loading} data-report-select={name}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );

  return (
    <div className="flex flex-col gap-3" data-report-panel="university-deadlines">
      {(title || description) && (
        <div>
          {title && <h3 className="text-sm font-medium text-ink">{title}</h3>}
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {!lockUniversity && field("Country", "country", f.country, [{ value: "", label: "Choose a country…" }, ...countries], (v) => void chooseCountry(v))}
        {!lockUniversity &&
          field("University", "university", f.university, [{ value: "", label: f.country ? "All universities" : "Choose a country first" }, ...universities], (v) => void chooseUniversity(v))}
        {field(
          "Level",
          "level",
          f.level,
          (Object.keys(LEVEL_LABELS) as ReportLevel[]).map((k) => ({ value: k, label: LEVEL_LABELS[k] })),
          (v) => setF((x) => ({ ...x, level: v as ReportLevel }))
        )}
        {field("Field", "field", f.field, [{ value: "", label: "No selection" }, ...REPORT_FIELDS.map((r) => ({ value: r.slug, label: r.label }))], (v) => setF((x) => ({ ...x, field: v })))}
        {field("Programmes", "programme", f.programme, programmeOptions, (v) => setF((x) => ({ ...x, programme: v })))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {onReportPage ? (
          <Button type="button" variant="primary" disabled={!ready || loading} onClick={() => router.push(`${HREF}${qs ? `?${qs}` : ""}`)} data-report-show>
            Show
          </Button>
        ) : (
          ready && (
            <Link
              prefetch={false}
              href={`${HREF}?${qs}`}
              className="inline-flex items-center rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
              data-report-open
            >
              Open the report
            </Link>
          )
        )}
        {ready ? (
          <>
            <ReportDownloadButton href={`${HREF}/download?${qs}&format=pdf`} format="pdf" fallbackName="Universities and deadlines" />
            <ReportDownloadButton href={`${HREF}/download?${qs}&format=xlsx`} format="xlsx" fallbackName="Universities and deadlines" />
          </>
        ) : (
          <span className="text-xs text-muted">Choose a country to make the report.</span>
        )}
      </div>
    </div>
  );
}
