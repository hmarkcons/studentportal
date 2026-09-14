// Whether to show "Saved." beside a button, and what it should say.
//
// Kept apart from the component so the rule can be tested without a browser:
// the confirmation stays until the person acts again, which sounds simple and
// has four states that all have to be right.

export type ActionResultLike = { success?: boolean; error?: string } | undefined | null | void;

/**
 * The confirmation to show, or null.
 *
 * Nothing while the action is running: a "Saved." left over from the previous
 * click, sitting beside a button that is busy saving again, says the wrong
 * thing about the wrong attempt.
 *
 * Nothing once the form has been touched either. A confirmation next to fields
 * that have since been edited reads as "your changes are saved" when they are
 * not, which is worse than saying nothing at all — it is the difference
 * between a quiet screen and a false one.
 *
 * And nothing when the result carries an error, even if something also set
 * success: the error is what the person needs, and two contradictory messages
 * beside one button is how people stop reading either.
 */
export function actionStatusMessage(
  state: ActionResultLike,
  options: { pending?: boolean; touchedSinceResult?: boolean; label?: string } = {}
): string | null {
  const { pending = false, touchedSinceResult = false, label = "Saved." } = options;
  if (pending || touchedSinceResult) return null;
  if (!state || state.error) return null;
  if (!state.success) return null;
  return label.trim() || "Saved.";
}
