// A university's specific requirements: filed from "Documents from the
// university" (File under › Specific requirement by the university) into the
// Other section, named with the university and the programme, and kept
// together there — one university's in the order they were added.
//
// No portal imports, so the unit tests load it under plain Node.

export const UNIVERSITY_REQUIREMENT_CATEGORY = "other";

/** "Motivation form — University of Padova — MSc Data Science"; the parts that are missing are left out. */
export function universityRequirementName(name: string, universityName?: string | null, programmeName?: string | null): string {
  return [name, universityName?.trim(), programmeName?.trim()].filter(Boolean).join(" — ");
}

/**
 * Each university's documents together, in the order they were added, the
 * group standing where its first one stood; everything else where it was.
 * `universityOf` names the group a document belongs to, or null for one in
 * none — a student-level document, or one outside the section.
 */
export function keepUniversitiesTogether<T extends { created_at?: string | null }>(
  docs: readonly T[],
  universityOf: (doc: T) => string | null | undefined
): T[] {
  const slots: (T | T[])[] = [];
  const groups = new Map<string, T[]>();
  for (const doc of docs) {
    const key = universityOf(doc);
    if (!key) {
      slots.push(doc);
      continue;
    }
    const group = groups.get(key);
    if (group) group.push(doc);
    else {
      const fresh = [doc];
      groups.set(key, fresh);
      slots.push(fresh);
    }
  }
  const added = (d: T) => d.created_at ?? "￿";
  return slots.flatMap((s) => (Array.isArray(s) ? [...s].sort((a, b) => (added(a) < added(b) ? -1 : added(a) > added(b) ? 1 : 0)) : [s]));
}
