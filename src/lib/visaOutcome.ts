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

export type VisaMessage = { heading: string; body: string[] };

export function visaMessage(decision: VisaDecision, studentName?: string | null): VisaMessage | null {
  const name = (studentName ?? "").trim().split(/\s+/)[0];

  if (decision === "approved") {
    return {
      heading: "Congratulations — your visa has been approved!",
      body: [
        `This is the moment everything has been building towards${name ? `, ${name}` : ""}. Every document you gathered and every deadline you met brought you here, and we could not be prouder to have been part of it.`,
        "Your counsellor will be in touch shortly about your next steps — travel, accommodation and enrolment. Welcome to the next chapter.",
      ],
    };
  }

  if (decision === "refused") {
    return {
      heading: "Your visa application was not successful this time",
      body: [
        "We know how much this meant to you, and we're genuinely sorry. A refusal is not a judgement on your ability or your ambition — many students who are refused once go on to study abroad successfully.",
        "Your counsellor will go through the refusal reason with you in detail and talk you through the options, including reapplying for the next intake. We're still with you.",
      ],
    };
  }

  return null;
}
