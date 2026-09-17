import { formatDateOnly } from "@/lib/formatDate";
import { ROUND_DATE_FORMAT, nextRound, roundIsClosed, sortRounds, type ProgramRound } from "@/lib/programRounds";

// Shared with the round dropdowns, so a date does not read one way in a form
// and another in the list beside it.
const DATE_FORMAT = ROUND_DATE_FORMAT;

// Built as a list and joined, rather than each piece carrying its own leading
// separator — a round is allowed to have only one of the two dates, and a
// separator attached to the deadline produced " ·  · apply by 3 Jan" whenever
// the start date was the missing one.
function RoundLine({
  round,
  today,
  withLabel,
}: {
  round: ProgramRound;
  today?: string;
  withLabel: boolean;
}) {
  const closed = roundIsClosed(round, today);
  const parts: React.ReactNode[] = [];

  if (withLabel) parts.push(<span className="font-medium">{round.label}</span>);
  if (round.start_date) parts.push(<>starts {formatDateOnly(round.start_date, DATE_FORMAT)}</>);
  if (round.application_deadline) {
    parts.push(
      <span className={closed ? "font-medium text-danger" : ""}>
        {closed ? "applications closed" : "apply by"} {formatDateOnly(round.application_deadline, DATE_FORMAT)}
      </span>
    );
  }

  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {part}
        </span>
      ))}
    </>
  );
}

/**
 * A programme's intake dates.
 *
 * A programme can run several rounds (0232), so the default is to show the one
 * a reader is actually looking for — the first still open — and say how many
 * others there are, rather than a list that a counselor scanning a university's
 * programmes has to read through. `showAll` lays every round out instead, for
 * the places where choosing between rounds is the point.
 *
 * Most programmes still have no dates at all, so this renders nothing rather
 * than a row of dashes.
 *
 * `today` is passed in rather than read from the clock here: the lint rule
 * against impurity in component bodies forbids reading the date during render,
 * and the business day is Karachi's rather than the viewer's or the server's.
 * Callers pass karachiToday(). Without it the dates still show, just without
 * the "closed" marker — and the first round leads instead of the open one.
 */
export function ProgramDates({
  rounds,
  today,
  showAll = false,
  inline = false,
  highlightRoundId = null,
  highlightLabel = "this application",
  className = "",
}: {
  rounds?: readonly ProgramRound[] | null;
  today?: string;
  showAll?: boolean;
  /**
   * The round this application is actually for (applications.round_id), marked
   * out of the list. Without it the list says which rounds exist but not which
   * one the reader is in, and a closed round above an open one reads as a
   * missed deadline rather than as somebody else's round.
   */
  highlightRoundId?: string | null;
  /** What the marker says next to the highlighted round. */
  highlightLabel?: string;
  /**
   * Continues a sentence that is already running — prepends the separator that
   * joins it to whatever precedes it. Callers that put this on a line of its
   * own leave it off, or it reads as " · Round 2 · starts …".
   */
  inline?: boolean;
  className?: string;
}) {
  const all = sortRounds(rounds ?? []);
  if (all.length === 0) return null;

  if (showAll) {
    return (
      <span className={`flex flex-col text-xs text-muted ${className}`}>
        {all.map((round, i) => {
          const mine = Boolean(highlightRoundId) && round.id === highlightRoundId;
          return (
            <span key={round.id ?? i} className={mine ? "text-ink" : ""}>
              <RoundLine round={round} today={today} withLabel={all.length > 1} />
              {mine && <span className="ml-1 font-medium text-primary">· {highlightLabel}</span>}
            </span>
          );
        })}
      </span>
    );
  }

  // Where the application names a round, that round leads — "the round you are
  // in" beats "the round still open", and they are often not the same one.
  // Otherwise fall back to whichever is still open.
  const named = highlightRoundId ? all.find((r) => r.id === highlightRoundId) : null;
  const lead = named ?? nextRound(all, today) ?? all[0];
  const others = all.length - 1;

  return (
    <span className={`text-xs text-muted ${className}`}>
      {inline && " · "}
      <RoundLine round={lead} today={today} withLabel={all.length > 1} />
      {others > 0 && <> · +{others} more round{others === 1 ? "" : "s"}</>}
    </span>
  );
}
