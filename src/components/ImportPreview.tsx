"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { ImportPreviewRow } from "@/lib/actions/leads";

const OUTCOME: Record<ImportPreviewRow["outcome"], { label: string; tone: "success" | "info" | "neutral" | "warning" }> = {
  new: { label: "New", tone: "success" },
  update: { label: "Updates existing", tone: "info" },
  unchanged: { label: "Nothing new", tone: "neutral" },
  skipped: { label: "Not imported", tone: "warning" },
};

/**
 * What an import would do, row by row, before anything is written: who is
 * new, who is already on file and what would be added to them, and who would
 * not be imported and why. Filtered by outcome with a click on its count.
 */
export function ImportPreview({ rows, notes = [] }: { rows: ImportPreviewRow[]; notes?: string[] }) {
  const [only, setOnly] = useState<ImportPreviewRow["outcome"] | null>(null);
  const counts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});
  const shown = only ? rows.filter((r) => r.outcome === only) : rows;

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-info/40 bg-info-bg/40 p-3" data-import-preview>
      <p className="text-sm font-medium text-ink">Preview — nothing has been imported yet.</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(Object.keys(OUTCOME) as ImportPreviewRow["outcome"][])
          .filter((o) => counts[o])
          .map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOnly(only === o ? null : o)}
              className={`rounded-md border px-2 py-0.5 ${only === o ? "border-primary bg-primary/10 text-primary" : "border-border text-ink hover:bg-bg"}`}
              data-preview-count={o}
            >
              {OUTCOME[o].label}: {counts[o]}
            </button>
          ))}
        {only && (
          <button type="button" onClick={() => setOnly(null)} className="text-primary hover:underline">
            Show all
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">No rows to import.</p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-md border border-border bg-card">
          <table className="w-full text-xs" data-row-highlight>
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-muted">
                <th className="w-10 px-2 py-1.5 text-right font-medium">#</th>
                <th className="px-2 py-1.5 font-medium">Name</th>
                <th className="px-2 py-1.5 font-medium">What happens</th>
                <th className="px-2 py-1.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-b border-border last:border-0 align-top" data-preview-row={r.outcome}>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">{i + 1}</td>
                  <td className="px-2 py-1.5 font-medium text-ink">{r.name}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <Badge tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-muted">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-xs text-muted">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Looks right? Press Import to go ahead — the same file is used, there is no need to choose it again.</p>
    </div>
  );
}
