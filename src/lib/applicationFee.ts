// What applying to a programme costs, and in what currency (0287).
//
// A fee is text (0303): an amount — "30", shown in its currency as €30 — or
// words, shown exactly as typed: "Free for EU students", "€30 (EU) / €50
// (non-EU)". Tuition is text the same way. parseFeeText is how every form and
// import reads one, so a plain amount is always stored the same way ("3,000.00"
// and "3000" are both "3000") and an import does not report it as changed.
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

/** Longer than this and it is a note, not a fee — the database holds the same limit (0303). */
export const FEE_TEXT_MAX = 120;

const SYMBOLS: Record<string, string> = { "€": "EUR", "£": "GBP", $: "USD" };
/** "30", "3,000", "3 000.50", with at most a currency symbol in front: an amount and nothing else. */
const PLAIN_AMOUNT = /^([€£$])?\s*(\d{1,3}(?:[,\s]\d{3})+|\d+)(\.\d{1,2})?$/;

/** An amount written the one way: no separators, no ".00", two decimals otherwise. */
function canonicalAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * A fee as a form or a sheet gives it. Blank is none. A plain amount — with a
 * € £ or $ in front at most — is stored as the number, and the symbol, when
 * there was one, is its currency. Anything else is stored as typed, with runs
 * of spaces made one; `symbolCurrency` is null then.
 */
export function parseFeeText(raw: string | number | null | undefined): { text: string | null; symbolCurrency: string | null } {
  if (raw === null || raw === undefined) return { text: null, symbolCurrency: null };
  if (typeof raw === "number") return { text: Number.isFinite(raw) ? canonicalAmount(raw) : null, symbolCurrency: null };
  const text = raw.trim().replace(/\s+/g, " ");
  if (text === "") return { text: null, symbolCurrency: null };
  const m = text.match(PLAIN_AMOUNT);
  if (!m) return { text, symbolCurrency: null };
  const n = Number(`${m[2].replace(/[,\s]/g, "")}${m[3] ?? ""}`);
  return { text: canonicalAmount(n), symbolCurrency: m[1] ? SYMBOLS[m[1]] : null };
}

/** Tuition as written. A plain number is stored as the number; anything else as typed — it has no currency column, so a symbol stays in the text. */
export function parseTuitionText(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? canonicalAmount(raw) : null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (text === "") return null;
  const m = text.match(PLAIN_AMOUNT);
  return m && !m[1] ? canonicalAmount(Number(`${m[2].replace(/[,\s]/g, "")}${m[3] ?? ""}`)) : text;
}

/** The amount a fee is, when it is nothing but an amount; null for words. */
export function plainAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const m = value.trim().match(PLAIN_AMOUNT);
  return m ? Number(`${m[2].replace(/[,\s]/g, "")}${m[3] ?? ""}`) : null;
}

/**
 * The first amount written in a fee or a tuition — "€3,000 per year" is 3000,
 * "3000–4500" is 3000 — for the one sum made with one: the partner commission
 * a tuition suggests. Null when it names none ("Free", "On request").
 */
export function firstAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // Thousands grouped by commas or spaces ("3,000", "3 000") read as one number.
  const m = value.match(/\d{1,3}(?:[, ]\d{3})+(?:\.\d+)?(?!\d)|\d+(?:\.\d+)?/);
  return m ? Number(m[0].replace(/[, ]/g, "")) : null;
}

/**
 * "10% of EUR 3000.00 tuition", for a partner commission suggested from a
 * programme's rate — and, when the tuition was written in words, the words the
 * amount was read from, so a suggestion made from "€3,000 per year, €2,500 for
 * EU students" can be checked at a glance.
 */
export function tuitionPhrase(ratePercent: number | null, currency: string | null, tuition: number | string | null): string {
  const base = `${ratePercent}% of ${currency} ${firstAmount(tuition)?.toFixed(2)} tuition`;
  return tuition !== null && plainAmount(tuition) === null ? `${base} (from “${String(tuition).trim()}”)` : base;
}

export type EffectiveFee = {
  /** As stored: an amount ("30") or words ("Free for EU students"). formatFee shows either. */
  amount: string;
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

/** A fee there is: any text at all, including "0" — free is a fee of nothing, not no fee. */
function toAmount(value: number | string | null | undefined): string | null {
  return parseFeeText(value).text;
}

/**
 * "€50", "£75.50", "US$120", "HUF 12,000" for an amount; words exactly as
 * written. Whole amounts without the ".00": an application fee is quoted that
 * way, and "€50.00" reads like an invoice.
 */
export function formatFee(amount: number | string, currency: string | null | undefined): string {
  const plain = plainAmount(amount);
  if (plain === null) return String(amount).trim();
  const n = plain;
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

const SYMBOL_CURRENCY = SYMBOLS;

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
