"use client";

import { useEffect, useRef, useState } from "react";
import { actionStatusMessage, type ActionResultLike } from "@/lib/actionStatus";

/**
 * Says what just happened, beside the button that did it.
 *
 * Errors were already reported everywhere; success mostly was not, so a staff
 * member pressing Save had nothing to tell them apart from a button that
 * stopped being busy. Fifty-two forms were in that state.
 *
 * The message stays until they act again rather than fading on a timer:
 * nothing is missed on a slow connection or by somebody who looked away. It
 * clears the moment the form is touched, so it can never sit there reading
 * "Saved." beside changes that are not.
 *
 * That clearing is done by listening on the enclosing form rather than asking
 * every caller to wire up an onChange, which is what makes this a one-line
 * addition at fifty-two call sites instead of a three-line one. A button with
 * no form around it — an onClick that calls an action directly — simply keeps
 * its message until the next result.
 */
export function ActionStatus({
  state,
  pending = false,
  label = "Saved.",
  className = "",
}: {
  state: ActionResultLike;
  /** Hides the message while the action is being redone. */
  pending?: boolean;
  /** What happened, in the past tense: "Saved.", "Sent.", "Uploaded." */
  label?: string;
  className?: string;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  // Which result the edit was made against, rather than a bare boolean. A new
  // result is therefore untouched by construction — no effect needed to reset
  // the flag, which is what stops this cascading renders.
  const [touchedFor, setTouchedFor] = useState<{ result: ActionResultLike } | null>(null);
  const touched = touchedFor !== null && touchedFor.result === state;

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const onEdit = () => setTouchedFor({ result: state });
    // Both, because `input` does not fire for a select or a checkbox in every
    // browser and `change` does not fire per keystroke in a text field.
    form.addEventListener("input", onEdit);
    form.addEventListener("change", onEdit);
    return () => {
      form.removeEventListener("input", onEdit);
      form.removeEventListener("change", onEdit);
    };
    // Re-bound whenever the result changes, or onEdit would close over the
    // result from the first render and stamp every edit with that one.
  }, [state]);

  const message = actionStatusMessage(state, { pending, touchedSinceResult: touched, label });

  // The anchor stays mounted even with nothing to say, so the listener above
  // is attached before the first result arrives rather than after it.
  return (
    <span ref={anchor} className={className || undefined}>
      {message && (
        <span role="status" className="text-xs font-medium text-success">
          {message}
        </span>
      )}
    </span>
  );
}
