// What applying to a programme costs, and in what currency (0287).
//
// A fee is text (0303): an amount — "30", shown in its currency as €30 — or
// words, shown exactly as typed: "Free for EU students", "€30 (EU) / €50
// (non-EU)". Tuition is text the same way. parseFeeText is how every form and
// import reads one, so a plain amount is always stored the same way ("3,000.00"
// and "3000" are both "3000") and an import does not report it as changed.
//
// Several fees in one field are separated by a comma AND a space (0304):
// "30, 50" is two fees, shown €30, €50, while "3,000" — no space — is three
// thousand, as it always was. "30 (EU), 50 (non-EU)" shows as €30 (EU),
// €50 (non-EU).
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

/** Room for several fees and a note about them — the database holds the same limit (0303, 0304). */
export const FEE_TEXT_MAX = 500;

const SYMBOLS: Record<string, string> = { "€": "EUR", "£": "GBP", $: "USD" };
/** "30", "3,000", "3 000.50", with at most a currency symbol in front: an amount and nothing else. */
const PLAIN_AMOUNT = /^([€£$])?\s*(\d{1,3}(?:[,\s]\d{3})+|\d+)(\.\d{1,2})?$/;

/** An amount written the one way: no separators, no ".00", two decimals otherwise. */
function canonicalAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** The number a PLAIN_AMOUNT match is. */
const matchedAmount = (m: RegExpMatchArray) => Number(`${m[2].replace(/[,\s]/g, "")}${m[3] ?? ""}`);

/** Several fees in one field: a comma or semicolon followed by a space separates them; "3,000" does not. */
const FEE_SEPARATOR = /[,;]\s+/;

/**
 * A list of plain amounts — "30, 50", "€30, €50" — written the one way, with
 * the one symbol they share as the currency. Null when it is not such a list:
 * any part in words, or symbols of two currencies.
 */
function amountList(text: string): { text: string; symbolCurrency: string | null } | null {
  const parts = text.split(FEE_SEPARATOR);
  if (parts.length < 2) return null;
  const matches = parts.map((p) => p.match(PLAIN_AMOUNT));
  if (matches.some((m) => m === null)) return null;
  const symbols = new Set(matches.map((m) => m![1]).filter(Boolean));
  if (symbols.size > 1) return null;
  const [symbol] = [...symbols];
  return { text: matches.map((m) => canonicalAmount(matchedAmount(m!))).join(", "), symbolCurrency: symbol ? SYMBOLS[symbol] : null };
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
  if (!m) return amountList(text) ?? { text, symbolCurrency: null };
  return { text: canonicalAmount(matchedAmount(m)), symbolCurrency: m[1] ? SYMBOLS[m[1]] : null };
}

/** Tuition as written. A plain number is stored as the number; anything else as typed — it has no currency column, so a symbol stays in the text. */
export function parseTuitionText(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? canonicalAmount(raw) : null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (text === "") return null;
  const m = text.match(PLAIN_AMOUNT);
  if (m) return m[1] ? text : canonicalAmount(matchedAmount(m));
  // "3,000, 4,500" is two tuitions, stored "3000, 4500"; with a symbol, as typed.
  const list = amountList(text);
  return list && list.symbolCurrency === null ? list.text : text;
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
 *
 * Several fees (0304) are each shown so — "30, 50" as "€30, €50", and an
 * amount with a note in brackets as "€30 (EU)" — while any other part is left
 * exactly as written. A part with a symbol of its own keeps that currency.
 */
export function formatFee(amount: number | string, currency: string | null | undefined): string {
  const plain = plainAmount(amount);
  if (plain === null) return formatFeeList(String(amount).trim(), currency);
  return formatOneAmount(plain, currency);
}

/** One plain amount in a currency. */
function formatOneAmount(n: number, currency: string | null | undefined): string {
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

/** An amount and a note in brackets: "30 (EU)", "€3,000 (non-EU)". */
const AMOUNT_WITH_NOTE = /^([€£$])?\s*(\d{1,3}(?:[,\s]\d{3})+|\d+)(\.\d{1,2})?\s*(\([^()]*\))$/;

/** Each part of a fee list that is an amount, formatted; the rest as written. Untouched when no part is an amount. */
function formatFeeList(text: string, currency: string | null | undefined): string {
  const separators = text.match(new RegExp(FEE_SEPARATOR.source, "g")) ?? [];
  const parts = text.split(FEE_SEPARATOR);
  let changed = false;
  const shown = parts.map((part) => {
    const m = part.match(PLAIN_AMOUNT) ?? part.match(AMOUNT_WITH_NOTE);
    if (!m) return part;
    changed = true;
    const own = m[1] ? SYMBOLS[m[1]] : null;
    const formatted = formatOneAmount(matchedAmount(m), own ?? currency);
    return m[4] ? `${formatted} ${m[4]}` : formatted;
  });
  if (!changed) return text;
  return shown.map((part, i) => (i === 0 ? part : `${separators[i - 1]?.startsWith(";") ? "; " : ", "}${part}`)).join("");
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
