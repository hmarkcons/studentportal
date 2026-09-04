// Shared with DocumentChecklist.tsx (the interactive checklist) and any
// server component that needs the same category order/labels without
// pulling in a "use client" module — plain constants can't be safely
// imported from a client component into server code (Next.js proxies
// non-component exports across that boundary instead of returning the
// real value), so this lives in its own plain module.

// "interview" has no document rows of its own in DocumentChecklist (it's a
// separate scheduling feature rendered via the `interviewSection` prop) but
// still occupies its place in the order.
export const CATEGORY_ORDER = [
  "admission",
  "interview",
  "attestation",
  "visa",
  "scholarship_documents",
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
