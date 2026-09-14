// Shared with DocumentChecklist.tsx (the interactive checklist) and any
// server component that needs the same category order/labels without
// pulling in a "use client" module — plain constants can't be safely
// imported from a client component into server code (Next.js proxies
// non-component exports across that boundary instead of returning the
// real value), so this lives in its own plain module.

// "interview" has no document rows of its own in DocumentChecklist (it's a
// separate scheduling feature rendered via the `interviewSection` prop) but
// still occupies its place in the order.
// Attestation second and scholarship documents third, matching what the
// per-destination checklists say (migration 0189). This list is only the
// fallback for a student whose destinations have no sections configured, but a
// fallback that disagrees with every real checklist is a trap for whoever
// reads one and then the other.
export const CATEGORY_ORDER = [
  "admission",
  "attestation",
  "scholarship_documents",
  "interview",
  "visa",
  "italian_translations",
  "visa_sticker",
  "travel",
  "enrollment",
  "scholarship",
  "other",
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  admission: "Admission Documents",
  attestation: "Attestation",
  visa: "Visa Application Requirements",
  scholarship_documents: "Scholarship Documents",
  italian_translations: "Italian Translations",
  visa_sticker: "Visa Sticker",
  travel: "Travel",
  enrollment: "Enrollment",
  scholarship: "Scholarship",
  other: "Other",
};
