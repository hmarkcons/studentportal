// Reading a documentation-tracker value.
//
// Every field's answer is stored as text in application_country_extra,
// whatever its type — a date as "2026-09-15", a multi-select as the JSON
// "[\"IMAT\",\"TOLC\"]". So "has this been answered" is not simply "is the
// string non-empty": an empty multi-select stores "[]", which is four
// characters of nothing and used to count towards the tracker's progress
// badge as though somebody had filled it in.

/** Whether a stored tracker value represents an actual answer. */
export function trackerValueFilled(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!value) return false;

  // A multi-select or multi-text field with nothing chosen.
  if (value.startsWith("[") || value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.some((v) => String(v ?? "").trim() !== "");
      }
      if (parsed && typeof parsed === "object") return Object.keys(parsed).length > 0;
      // A JSON scalar — "null" or "0" — is a value like any other string.
      return String(parsed ?? "").trim() !== "";
    } catch {
      // Not valid JSON after all, so it is just text that happens to start
      // with a bracket. Somebody typed it; it counts.
      return true;
    }
  }

  return true;
}

/**
 * The choices held in a multi-select value.
 *
 * Tolerates a bare string, because a field that used to be a single select
 * stores its old answers unquoted — "CEnT-S" rather than ["CEnT-S"] — and
 * reading those as nothing would make a student's recorded test silently
 * disappear from the form and then be overwritten on the next save.
 */
export function parseMultiValue(raw: string | null | undefined): string[] {
  const value = (raw ?? "").trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v ?? "").trim()).filter(Boolean);
    return [String(parsed ?? "").trim()].filter(Boolean);
  } catch {
    return [value];
  }
}
