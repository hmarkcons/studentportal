type YearRow = { year: number; referred: number; enrolled: number };

export function ReferralTrendChart({ data }: { data: YearRow[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">Not enough data yet.</p>;
  }

  const max = Math.max(1, ...data.map((d) => Math.max(d.referred, d.enrolled)));
  const barMaxHeight = 96;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-ink">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "var(--chart-referred)" }} />
          Referred
        </span>
        <span className="flex items-center gap-1.5 text-ink">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "var(--chart-enrolled)" }} />
          Enrolled
        </span>
      </div>

      <div className="flex items-end gap-6 border-b border-border pb-2">
        {data.map((d) => (
          <div key={d.year} className="flex flex-col items-center gap-1">
            <div className="flex items-end gap-1" style={{ height: barMaxHeight }}>
              <div className="flex flex-col items-center justify-end gap-1">
                <span className="text-[10px] tabular-nums text-muted">{d.referred}</span>
                <div
                  title={`${d.year} · Referred: ${d.referred}`}
                  style={{
                    height: Math.max(2, (d.referred / max) * barMaxHeight),
                    width: 18,
                    backgroundColor: "var(--chart-referred)",
                    borderRadius: "4px 4px 0 0",
                  }}
                />
              </div>
              <div className="flex flex-col items-center justify-end gap-1">
                <span className="text-[10px] tabular-nums text-muted">{d.enrolled}</span>
                <div
                  title={`${d.year} · Enrolled: ${d.enrolled}`}
                  style={{
                    height: Math.max(2, (d.enrolled / max) * barMaxHeight),
                    width: 18,
                    backgroundColor: "var(--chart-enrolled)",
                    borderRadius: "4px 4px 0 0",
                  }}
                />
              </div>
            </div>
            <span className="text-xs text-muted">{d.year}</span>
          </div>
        ))}
      </div>

      <table className="mt-4 w-full text-xs">
        <caption className="sr-only">Students referred and enrolled per year</caption>
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-4">Year</th>
            <th className="py-1 pr-4">Referred</th>
            <th className="py-1">Enrolled</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.year} className="text-ink">
              <td className="py-1 pr-4">{d.year}</td>
              <td className="py-1 pr-4 tabular-nums">{d.referred}</td>
              <td className="py-1 tabular-nums">{d.enrolled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
