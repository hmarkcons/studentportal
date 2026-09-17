import { formatDateOnly } from "@/lib/formatDate";
import { daysUntil } from "@/lib/applicationDeadline";

/**
 * A programme's start date and application deadline, as one line.
 *
 * Both are optional and most programmes still have neither, so this renders
 * nothing at all rather than a row of dashes.
 *
 * `today` is passed in rather than read from the clock here: the lint rule
 * against impurity in component bodies forbids reading the date during render,
 * and the business day is Karachi's rather than the viewer's or the server's.
 * Callers pass karachiToday(). Without it the dates still show, just without
 * the "closed" marker.
 */
export function ProgramDates({
  startDate,
  deadline,
  today,
  className = "",
}: {
  startDate?: string | null;
  deadline?: string | null;
  today?: string;
  className?: string;
}) {
  const start = (startDate ?? "").trim();
  const close = (deadline ?? "").trim();
  if (!start && !close) return null;

  // Only where we were given a today to compare against, and only for a date
  // that has actually gone — a deadline three days away is not news, it is the
  // normal state of a deadline.
  const closed = close && today ? daysUntil(close, today) < 0 : false;

  return (
    <span className={`text-xs text-muted ${className}`}>
      {start && <> · starts {formatDateOnly(start)}</>}
      {close && (
        <>
          {" · "}
          <span className={closed ? "font-medium text-danger" : ""}>
            {closed ? "applications closed" : "apply by"} {formatDateOnly(close)}
          </span>
        </>
      )}
    </span>
  );
}
