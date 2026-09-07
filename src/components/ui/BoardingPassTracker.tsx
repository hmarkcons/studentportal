import { Badge } from "./Badge";

const MANUAL_STATUSES = new Set(["rejected", "declined", "withdrawn"]);

function label(stage: string) {
  return stage
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function BoardingPassTracker({
  universityName,
  programName,
  intake,
  currentStage,
  pipelineStages,
}: {
  universityName: string;
  programName?: string | null;
  intake?: string | null;
  currentStage: string;
  pipelineStages: string[];
}) {
  const isManual = MANUAL_STATUSES.has(currentStage);
  const currentIndex = pipelineStages.indexOf(currentStage);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between bg-primary px-5 py-4 text-primary-ink">
        <div>
          <p className="text-sm font-semibold">{universityName}</p>
          {programName && <p className="text-xs opacity-90">{programName}</p>}
        </div>
        {intake && <span className="text-xs opacity-90">Intake: {intake}</span>}
      </div>

      <div className="relative border-t border-dashed border-border px-5 py-4">
        {isManual ? (
          <Badge tone="danger">{label(currentStage)}</Badge>
        ) : (
          // Wraps onto extra rows rather than scrolling: a scroller cut the
          // last stage by a few pixels at some widths, too small to read as
          // scrollable, so the stage just looked truncated. Grid rather than
          // flex-wrap so every row keeps the same column width — wrapped flex
          // items stretch, leaving a short last row of oversized stages.
          <div className="grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-x-1 gap-y-3 pb-1">
            {pipelineStages.map((stage, i) => (
              <div key={stage} className="flex flex-col items-center gap-1">
                <div
                  className={`h-1.5 w-full rounded-full ${i <= currentIndex ? "bg-primary" : "bg-border"}`}
                />
                <span
                  className={`text-center text-[10px] leading-tight ${
                    i === currentIndex ? "font-medium text-ink" : "text-muted"
                  }`}
                >
                  {label(stage)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
