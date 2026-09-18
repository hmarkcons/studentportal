/**
 * Pay lives on staff_compensation, not staff (migration 0249/0250).
 *
 * It was moved because policy "staff_select" lets five roles read every staff
 * row, and RLS has no column dimension — whoever may read the row reads the
 * salary on it. staff_compensation has its own policy: your own row, the Super
 * Admin, and Finance.
 *
 * Reading it means a PostgREST embed, and the embed comes back as null for
 * anyone the policy excludes — not as an error. So every consumer flattens
 * through `withCompensation`, which supplies the same defaults the columns
 * themselves had. A viewer who may not see pay therefore sees the same thing
 * as a staff member whose pay has never been set, which is the right answer
 * for both.
 */

export type Compensation = {
  monthly_salary: number | null;
  currency: string;
  allowance: number | null;
  commission_rate_general: number | null;
  commission_rate_public_universities: number | null;
  commission_type_general: string;
  commission_type_public_universities: string;
  bonus_eligible: boolean;
  bonus_rate_percent: number | null;
};

export const COMPENSATION_COLUMNS =
  "monthly_salary, currency, allowance, commission_rate_general, commission_rate_public_universities, " +
  "commission_type_general, commission_type_public_universities, bonus_eligible, bonus_rate_percent";

/**
 * Embed for a `from("staff").select(...)`.
 *
 * The constraint is named explicitly because staff_compensation has TWO
 * foreign keys to staff — `staff_id` and `updated_by` — and without the hint
 * PostgREST refuses the whole query: "more than one relationship was found for
 * 'staff' and 'staff_compensation'". It fails on every row, including none, so
 * it is not the kind of thing that hides until there is data.
 */
export const COMPENSATION_EMBED =
  `compensation:staff_compensation!staff_compensation_staff_id_fkey(${COMPENSATION_COLUMNS})`;

/** What an unset — or unreadable — pay row looks like. Matches the old column defaults. */
export const NO_COMPENSATION: Compensation = {
  monthly_salary: null,
  currency: "PKR",
  allowance: null,
  commission_rate_general: null,
  commission_rate_public_universities: null,
  commission_type_general: "percentage",
  commission_type_public_universities: "percentage",
  bonus_eligible: false,
  bonus_rate_percent: null,
};

type Embedded = { compensation?: Partial<Compensation> | Partial<Compensation>[] | null };

/**
 * Flattens the embedded pay row onto the staff row, so consumers keep reading
 * `staff.monthly_salary` as they did when it was a column.
 *
 * PostgREST returns a to-one embed as an object, but returns an array when it
 * can't prove the relationship is unique, so both shapes are accepted.
 */
export function withCompensation<T extends Embedded>(row: T): Omit<T, "compensation"> & Compensation {
  const { compensation, ...rest } = row;
  const pay = (Array.isArray(compensation) ? compensation[0] : compensation) ?? null;
  return { ...(rest as Omit<T, "compensation">), ...NO_COMPENSATION, ...(pay ?? {}) };
}

export function withCompensationAll<T extends Embedded>(rows: T[] | null | undefined) {
  return (rows ?? []).map(withCompensation);
}

/** Reads the pay fields a form posted. Numbers stay null when the field is blank. */
export function compensationFromFormData(formData: FormData): Compensation {
  const num = (k: string) => (formData.get(k) ? Number(formData.get(k)) : null);
  const type = (k: string) => (String(formData.get(k) ?? "percentage") === "flat" ? "flat" : "percentage");
  // The rate is only kept while the bonus is actually switched on, so turning
  // the bonus off clears the rate instead of leaving a figure behind that
  // nothing shows but payroll would find if it were ever switched back.
  const bonusEligible = formData.get("bonus_eligible") === "on";
  return {
    monthly_salary: num("monthly_salary"),
    currency: String(formData.get("currency") ?? "PKR"),
    allowance: num("allowance"),
    commission_rate_general: num("commission_rate_general"),
    commission_rate_public_universities: num("commission_rate_public_universities"),
    commission_type_general: type("commission_type_general"),
    commission_type_public_universities: type("commission_type_public_universities"),
    bonus_eligible: bonusEligible,
    bonus_rate_percent: bonusEligible ? num("bonus_rate_percent") : null,
  };
}
