// What applying to a programme costs, and in what currency (0287).
//
// A university usually charges one application fee whatever the programme, so
// the fee is kept on the university and a programme records its own only where
// it differs. Everything that shows a programme's fee asks effectiveFee rather
// than reading either column, so the two can never be read the wrong way
// round.
//
// Pure, so it is unit-tested (scripts/application-fee-test.mjs) and shared by
// the import parsers, which run under plain Node.

/** The currencies the pickers offer, the destinations' own first. */
export const FEE_CURRENCIES = ["EUR", "GBP", "USD", "CAD", "AUD", "NZD", "TRY", "HUF", "SEK", "RON", "CHF", "PKR"] as const;

export type FeeRow = { application_fee: number | string | null; application_fee_currency: string | null };

export type EffectiveFee = {
  amount: number;
  currency: string;
  /** Where it came from: the programme's own fee, or the university's for every programme. */
  from: "programme" | "university";
};

/**
 * The fee a programme charges: its own when it has one, otherwise its
 * university's. The currency is the one saved with that fee; the database
 * fills it in whenever a fee is saved without one, so the fallback is only
 * for a row read before that could happen.
 */
export function effectiveFee(
  programme: FeeRow | null | undefined,
  university: FeeRow | null | undefined,
  fallbackCurrency = "EUR"
): EffectiveFee | null {
  const own = toAmount(programme?.application_fee);
  if (own !== null) return { amount: own, currency: programme?.application_fee_currency || university?.application_fee_currency || fallbackCurrency, from: "programme" };
  const shared = toAmount(university?.application_fee);
  if (shared !== null) return { amount: shared, currency: university?.application_fee_currency || fallbackCurrency, from: "university" };
  return null;
}

function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * "€50", "£75.50", "US$120", "HUF 12,000". Whole amounts without the ".00":
 * an application fee is quoted that way, and "€50.00" reads like an invoice.
 */
export function formatFee(amount: number | string, currency: string | null | undefined): string {
  const n = Number(amount);
  const code = (currency || "EUR").toUpperCase();
  const whole = Number.isInteger(n);
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${code} ${whole ? n : n.toFixed(2)}`;
  }
}

const SYMBOL_CURRENCY: Record<string, string> = { "€": "EUR", "£": "GBP", $: "USD" };

/**
 * A currency cell: an ISO code in any case, or the symbol somebody typed
 * instead. Blank is null — "said nothing" — and a code nobody recognises is
 * reported rather than saved, because a fee in the wrong currency is wrong by
 * a factor, not a rounding.
 *
 * When the currency cell is blank, the fee cell's own symbol answers it:
 * "€50" says EUR as plainly as the column would have.
 */
export function parseFeeCurrency(
  currencyCell: string | undefined,
  feeCell: string | undefined,
  problems: string[],
  label: string
): string | null {
  const raw = (currencyCell ?? "").trim();
  if (raw === "") {
    const symbol = (feeCell ?? "").trim().match(/[€£$]/)?.[0];
    return symbol ? SYMBOL_CURRENCY[symbol] : null;
  }
  const code = SYMBOL_CURRENCY[raw] ?? raw.toUpperCase();
  if (!(FEE_CURRENCIES as readonly string[]).includes(code)) {
    problems.push(`${label} "${raw}" is not a currency this knows (${FEE_CURRENCIES.join(", ")}) — left unchanged`);
    return null;
  }
  return code;
}

/** An email, or null with the reason reported: the database refuses anything without an @ in the middle. */
export function parseEmail(value: string | undefined, problems: string[], label: string): string | null {
  const raw = (value ?? "").trim();
  if (raw === "") return null;
  if (!/^[^@\s]+@[^@\s]+$/.test(raw)) {
    problems.push(`${label} "${raw}" is not an email address — left unchanged`);
    return null;
  }
  return raw;
}
