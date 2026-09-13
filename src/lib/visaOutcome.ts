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
  country?: string | null
): VisaMessage | null {
  const name = (studentName ?? "").trim().split(/\s+/)[0];

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
