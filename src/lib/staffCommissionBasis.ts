// What a counselor's commission for one student comes to, and why it sometimes
// cannot be worked out yet.
//
// The rule already existed in the Staff Commission page's "add" form: a flat
// amount, or a percentage of that student's consultancy fee net of discount,
// chosen by whether the destination is a public or a private track. What did
// not exist was anything applying it on its own — every commission row was
// typed in by hand, so a registered student nobody remembered simply never
// earned their counselor anything.
//
// Kept out of the pages so the same answer is given wherever it is asked:
// when a student registers, when their agreement is signed, and when Payroll
// lists who is still missing from the ledger.

export type CommissionRates = {
  currency: string | null;
  commission_rate_general: number | null;
  commission_rate_public_universities: number | null;
  commission_type_general: string | null;
  commission_type_public_universities: string | null;
};

export type CommissionBasis = {
  track: string | null;
  consultancyFee: number | null;
  currency: string | null;
};

export type CommissionOutcome =
  | { ok: true; amount: number; currency: string; rate: number; type: string }
  | { ok: false; reason: string };

/**
 * The amount, or the reason there isn't one.
 *
 * A reason rather than a silent null, because "this student is not in the
 * ledger" and "this student cannot be priced until their agreement is signed"
 * need different actions from whoever is looking.
 */
export function commissionFor(staff: CommissionRates | null, basis: CommissionBasis | null): CommissionOutcome {
  if (!staff) return { ok: false, reason: "No counselor assigned" };
  if (!basis?.track) return { ok: false, reason: "No signed agreement yet" };

  const isPublic = basis.track === "public";
  const rate = isPublic ? staff.commission_rate_public_universities : staff.commission_rate_general;
  const type = isPublic ? staff.commission_type_public_universities : staff.commission_type_general;

  if (rate == null) {
    return { ok: false, reason: `No ${isPublic ? "public-university" : "private-university"} rate on their staff record` };
  }

  if (type === "flat") {
    return { ok: true, amount: rate, currency: staff.currency ?? "PKR", rate, type: "flat" };
  }

  if (basis.consultancyFee == null) return { ok: false, reason: "No consultancy fee on the agreement" };
  // A fee reduced to nothing by a discount earns nothing, and saying so is
  // better than creating a zero row somebody has to wonder about.
  if (basis.consultancyFee <= 0) return { ok: false, reason: "Consultancy fee is zero after discount" };

  return {
    ok: true,
    amount: Math.round(basis.consultancyFee * (rate / 100) * 100) / 100,
    currency: basis.currency ?? staff.currency ?? "PKR",
    rate,
    type: "percentage",
  };
}

/** The first day of the month a date falls in, as the payroll keys months. */
export function monthStartOf(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}
