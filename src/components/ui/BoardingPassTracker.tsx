import { Badge } from "./Badge";
import { Plane } from "lucide-react";

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
  round,
  currentStage,
  pipelineStages,
  tone = "flat",
}: {
  universityName: string;
  programName?: string | null;
  intake?: string | null;
  /**
   * Which intake round this application is for.
   *
   * Part of the card's identity, not a detail: a student can hold two
   * applications for the same programme in two different rounds (0234), and
   * without the round those two cards are identical down to the university,
   * the programme and the intake.
   */
  round?: string | null;
  currentStage: string;
  pipelineStages: string[];
  /**
   * "pass" is the student portal's: a ticket — its label and plane, a torn
   * edge with notches — on a white card. Staff keep the flat card.
   */
  tone?: "flat" | "pass";
}) {
  const pass = tone === "pass";
  const isManual = MANUAL_STATUSES.has(currentStage);
  const currentIndex = pipelineStages.indexOf(currentStage);

  return (
    <div className={`relative overflow-hidden border border-border bg-card ${pass ? "rounded-2xl" : "rounded-xl"}`} data-lift={pass || undefined}>
      {/* Staff's flat card: a slim brand stripe rather than a green header,
          so a list of applications does not stack block on block of colour. */}
      {!pass && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--brand-bright)]" />}
      <div className={`flex items-center justify-between px-5 ${pass ? "py-4" : "py-3.5"} text-ink`}>
        <div className="flex min-w-0 items-center gap-3">
          {pass && (
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-strong)]">
              <Plane className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            {pass && <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Boarding pass</p>}
            <p className={pass ? "text-base font-semibold" : "text-sm font-semibold"}>{universityName}</p>
            {programName && <p className="text-xs text-muted">{programName}</p>}
          </div>
        </div>
        {(intake || round) && (
          <div className="flex shrink-0 flex-col items-end gap-0.5 pl-3">
            {intake && <span className="text-xs text-muted">Intake: {intake}</span>}
            {round && <span className="text-xs font-semibold">{round}</span>}
          </div>
        )}
      </div>

      <div className="relative border-t border-dashed border-border px-5 py-4">
        {/* The ticket's notches, where a pass is torn. */}
        {pass && (
          <>
            <span aria-hidden className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full border border-border bg-bg" />
            <span aria-hidden className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full border border-border bg-bg" />
          </>
        )}
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
                  className={`w-full rounded-full ${pass ? "h-2" : "h-1.5"} ${i <= currentIndex ? "bg-[var(--brand-bright)]" : "bg-border"}`}
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
