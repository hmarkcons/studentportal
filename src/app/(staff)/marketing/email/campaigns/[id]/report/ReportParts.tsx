import type { HourPoint } from "@/lib/emailCampaigns/reportRules";

// The report's pieces, drawn on the server: no chart library, no client code.

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "good" }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-xl font-semibold ${tone === "warn" ? "text-warning" : tone === "good" ? "text-success" : "text-ink"}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

/** A table whose main number is also a bar, so the eye finds the biggest at once. */
export function BarTable({
  title,
  rows,
  columns,
  empty = "Nothing yet.",
  dataAttr,
}: {
  title: string;
  rows: { key: string; value: number; cells: (string | number)[] }[];
  columns: string[];
  empty?: string;
  dataAttr?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div {...(dataAttr ? { [`data-${dataAttr}`]: "" } : {})}>
      <h3 className="mb-2 text-sm font-medium text-ink">{title}</h3>
      {!rows.length ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                {columns.map((c, i) => (
                  <th key={c} className={`py-1 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1.5 pr-3">
                    <p className="max-w-[28rem] truncate text-ink" title={r.key}>
                      {r.key}
                    </p>
                    <div className="mt-1 h-1.5 rounded-full bg-bg">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
                    </div>
                  </td>
                  {r.cells.map((c, i) => (
                    <td key={i} className="py-1.5 pr-3 text-right text-ink">
                      {typeof c === "number" ? c.toLocaleString("en-US") : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const karachiHour = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3_600_000);

/** Opens and clicks hour by hour, Karachi time, with a tick at each midnight. */
export function TimelineChart({ points }: { points: HourPoint[] }) {
  const W = 840;
  const H = 160;
  const pad = { l: 34, r: 8, t: 8, b: 22 };
  const max = Math.max(1, ...points.map((p) => Math.max(p.opens, p.clicks)));
  const step = (W - pad.l - pad.r) / Math.max(1, points.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const bar = Math.max(1, step * 0.8);
  const total = points.reduce((s, p) => s + p.opens + p.clicks, 0);
  return (
    <figure data-report-timeline>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Opens and clicks by hour">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-border" strokeWidth={0.5} />
            <text x={pad.l - 4} y={y(max * f) + 3} textAnchor="end" fontSize={9} fill="currentColor" className="text-muted">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = pad.l + i * step;
          const k = karachiHour(p.bucket);
          return (
            <g key={p.bucket}>
              {p.opens > 0 && <rect x={x} y={y(p.opens)} width={bar} height={y(0) - y(p.opens)} fill="var(--primary)" opacity={0.35} />}
              {p.clicks > 0 && <rect x={x + bar * 0.25} y={y(p.clicks)} width={bar * 0.5} height={y(0) - y(p.clicks)} fill="var(--primary)" />}
              {k.getUTCHours() === 0 && (
                <>
                  <line x1={x} x2={x} y1={pad.t} y2={H - pad.b} stroke="currentColor" className="text-border" strokeWidth={0.5} strokeDasharray="2 2" />
                  <text x={x + 2} y={H - 8} fontSize={9} fill="currentColor" className="text-muted">
                    {k.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-[11px] text-muted">
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-primary opacity-35" />
          Opens (people)
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-primary" />
          Clicks (people)
        </span>
        <span>Karachi time, by the hour{total === 0 ? " — nothing yet" : ""}</span>
      </figcaption>
    </figure>
  );
}

/** Sent → delivered → opened → clicked → visited → converted, each as a share of those sent. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="flex flex-col gap-1.5" data-report-funnel>
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[9rem_minmax(0,1fr)_6rem] items-center gap-2 text-xs">
          <span className="text-muted">{s.label}</span>
          <div className="h-4 rounded bg-bg">
            <div className="h-4 rounded bg-primary/70" style={{ width: `${Math.max(1, (s.value / top) * 100)}%` }} />
          </div>
          <span className="text-right text-ink">
            {s.value.toLocaleString("en-US")} <span className="text-muted">({((s.value / top) * 100).toFixed(1)}%)</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
