"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ReportDownloadButton } from "@/components/reports/ReportDownloadButton";

export type PanelSelect = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** Chosen at first; the first option otherwise. */
  value?: string;
};

/**
 * Making a report: its dropdowns, then Download PDF / Download Excel of what
 * is chosen — and the report itself, on screen. The same panel stands on the
 * report's page (where "Show" redraws it) and in the sections the office
 * asked for it in (Consultancy Fee, Registered Students, Applications,
 * Universities), set to what that place is about through `fixed`.
 */
export function ReportFilterPanel({
  id,
  title,
  description,
  reportHref,
  downloadHref,
  selects,
  fixed = {},
  onReportPage = false,
}: {
  /** For the checks: data-report-panel. */
  id: string;
  title?: string;
  description?: string;
  /** The report's page. */
  reportHref: string;
  /** Its download route, which takes the same query and format=pdf|xlsx. */
  downloadHref: string;
  selects: PanelSelect[];
  /** Set by the place it stands in, not chosen: a student, a university. */
  fixed?: Record<string, string>;
  /** On the report's own page: "Show" redraws it there. */
  onReportPage?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(selects.map((s) => [s.name, s.value ?? s.options[0]?.value ?? ""]))
  );
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(fixed)) if (v) query.set(k, v);
  for (const [k, v] of Object.entries(values)) if (v) query.set(k, v);
  const qs = query.toString();
  const withFormat = (format: string) => `${downloadHref}?${qs ? `${qs}&` : ""}format=${format}`;

  return (
    <div className="flex flex-col gap-3" data-report-panel={id}>
      {(title || description) && (
        <div>
          {title && <h3 className="text-sm font-medium text-ink">{title}</h3>}
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {selects.map((s) => (
          <label key={s.name} className="flex min-w-48 flex-col gap-1 text-xs text-muted">
            {s.label}
            <Select
              name={s.name}
              value={values[s.name]}
              onChange={(e) => setValues((all) => ({ ...all, [s.name]: e.target.value }))}
              data-report-select={s.name}
            >
              {s.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
        ))}
        {onReportPage ? (
          <Button type="button" variant="primary" onClick={() => router.push(`${reportHref}${qs ? `?${qs}` : ""}`)} data-report-show>
            Show
          </Button>
        ) : (
          <Link
            prefetch={false}
            href={`${reportHref}${qs ? `?${qs}` : ""}`}
            className="inline-flex items-center rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            data-report-open
          >
            Open the report
          </Link>
        )}
        <ReportDownloadButton href={withFormat("pdf")} format="pdf" fallbackName={title ?? "Report"} />
        <ReportDownloadButton href={withFormat("xlsx")} format="xlsx" fallbackName={title ?? "Report"} />
      </div>
    </div>
  );
}
