// The student Visa tab is driven by the documentation tracker, so the decision
// has to be read out of whatever field a country marks with visa_role
// 'outcome'. Countries word that field differently ("Granted", "Issued",
// "Refused", "Rejected"), and staff add more countries themselves, so match on
// vocabulary rather than on an exact set of values — and stay silent when the
// value is not recognisable, rather than congratulating someone by mistake.

export type VisaDecision = "approved" | "refused" | "pending";

const APPROVED = ["approved", "granted", "issued", "accepted", "successful", "visa received", "stamped"];
const REFUSED = ["refused", "rejected", "denied", "unsuccessful", "declined"];

export function readVisaDecision(rawValue: string | null | undefined): VisaDecision {
  const v = (rawValue ?? "").trim().toLowerCase();
  if (!v) return "pending";
  // Refusal is checked first: "not approved" contains "approved", and calling
  // a refusal an approval is the worst possible failure here.
  if (REFUSED.some((w) => v.includes(w))) return "refused";
  if (v.startsWith("not ") || v.startsWith("no ")) return "pending";
  if (APPROVED.some((w) => v.includes(w))) return "approved";
  return "pending";
}

export type VisaMessage = { heading: string; body: string[]; signoff: string };

/** What the office may drop into its own wording. */
export const VISA_PLACEHOLDERS = ["{name}", "{country}"] as const;

/**
 * Fills {name} and {country} into text the office wrote.
 *
 * The cleanup afterwards is the whole job. Once the wording is editable, the
 * sentence around a placeholder is not mine to control — somebody will write
 * "Congratulations, {name} — you're going to {country}." and then a student
 * with no finalised country will read "Congratulations, — you're going to ."
 *
 * So an empty value takes its own punctuation with it: the comma that
 * introduced it, the stray space, the full stop left hanging. Not perfect
 * English in every possible sentence, but never visibly broken, which is the
 * thing that matters on the page where someone finds out whether they are
 * going.
 */
export function fillVisaTemplate(text: string, values: { name?: string | null; country?: string | null }): string {
  const name = (values.name ?? "").trim().split(/\s+/)[0] ?? "";
  const country = (values.country ?? "").trim();

  let out = text.replace(/\{name\}/g, name).replace(/\{country\}/g, country);

  if (!name || !country) {
    out = out
      // "Congratulations, — it's official" → the comma goes, the space stays.
      .replace(/,\s*(?=[—–-]\s)/g, " ")
      // "to ." / "for ." — a preposition left pointing at nothing.
      .replace(/\b(?:to|for|in|at)\s+(?=[.!?])/gi, "")
      .replace(/\s+([.,!?])/g, "$1")
      .replace(/,\s*,/g, ",")
      .replace(/[ \t]{2,}/g, " ");

    // A paragraph that now opens with punctuation — "{name}, we're sorry"
    // with no name — loses it, and the sentence gets its capital back.
    out = out
      .split("\n")
      .map((line) => {
        const trimmed = line.replace(/^[\s,;:]+/, "");
        return trimmed.replace(/^([a-z])/, (c) => c.toUpperCase());
      })
      .join("\n");
  }

  return out.trim();
}

/** Blank lines separate paragraphs — how anybody writes prose in a textarea. */
export function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/** The office's stored wording, or null to fall back to the built-in copy. */
export type VisaMessageTemplates = {
  approved_heading: string;
  approved_body: string;
  approved_signoff: string;
  refused_heading: string;
  refused_body: string;
  refused_signoff: string;
} | null;

/**
 * What a student reads when the decision arrives.
 *
 * This is the only part of the portal that carries genuine news, good or bad,
 * and it is read once. The wording is the office's own — approved keeps the
 * celebration and closes professionally; refused names the disappointment and
 * gives room before it offers anything, because hope offered before the bad
 * news has landed reads as brushing past it.
 */
export function visaMessage(
  decision: VisaDecision,
  studentName?: string | null,
  country?: string | null,
  // Edited in Setup › Visa messages. Absent only on a database that predates
  // the table, or one where the row was deleted — the built-in copy below is
  // what a student reads then, rather than a blank card.
  templates?: VisaMessageTemplates
): VisaMessage | null {
  const name = (studentName ?? "").trim().split(/\s+/)[0];

  if (templates && decision !== "pending") {
    const heading = decision === "approved" ? templates.approved_heading : templates.refused_heading;
    const body = decision === "approved" ? templates.approved_body : templates.refused_body;
    const signoff = decision === "approved" ? templates.approved_signoff : templates.refused_signoff;
    return {
      heading: fillVisaTemplate(heading, { name: studentName, country }),
      body: splitParagraphs(fillVisaTemplate(body, { name: studentName, country })),
      signoff: (signoff ?? "").trim(),
    };
  }

  if (decision === "approved") {
    return {
      heading: "🎉 Your visa has been issued",
      body: [
        `Congratulations${name ? `, ${name}` : ""} — it's official.${country ? ` You're going to ${country}.` : ""}`,
        "After everything you put into this application, take a moment to enjoy it. It has been a pleasure supporting you from the first document to this result, and the whole team wishes you every success in your studies.",
      ],
      signoff: "HMARK Consultants",
    };
  }

  if (decision === "refused") {
    return {
      heading: "Your visa was not approved this time",
      body: [
        `${name ? `${name}, we're` : "We're"} sorry. We know how much you put into this, and a refusal is hard news to receive. Take a moment — it's fair to feel that.`,
        "When you're ready, we're still here. It isn't the end of the road: many students who apply again are successful, and a refusal reason is something that can be worked on rather than a closed door. We'll look at it together, and if you'd like to try for the next intake, we'll help you prepare from the start.",
        "Nothing you've achieved so far is lost.",
      ],
      signoff: "The HMARK team",
    };
  }

  return null;
}
