// The look of an agreement: page, fonts, colours, headings, bullets, tables,
// the payment chart and the letterhead — set per template in the builder's
// "Page & theme" panel and stored as agreement_templates.design (0281), and
// the same for staff agreement templates.
//
// A template with no design stored prints in the Classic look, exactly as
// every agreement printed before the builder could style one: that path is
// AgreementDocument's own fixed styles, not a theme, so nothing already issued
// changes when it is regenerated. A stored design is a complete Theme, filled
// out from a preset, so a later change to a preset never restyles a template
// someone already set up.
//
// Pure, so it is unit-tested (scripts/agreement-builder-test.mjs).

// ------------------------------------------------------------------ fonts
//
// What the builder offers, and what the PDF embeds. Each is bundled in
// public/fonts/agreement (Latin subsets, SIL Open Font License), so the editor
// shows exactly the face the PDF will print in. Calibri, Arial, Times New
// Roman, Georgia and Cambria cannot be embedded in a PDF we generate; each has
// a metric-compatible stand-in here, with the same widths, so text breaks
// across lines the way it does in Word.

export type FontChoice = {
  /** The family name, as stored in a template and registered with the PDF renderer. */
  key: string;
  label: string;
  /** File-name stem in public/fonts/agreement: `${file}-{400|700}-{normal|italic}.ttf`. */
  file: string;
  kind: "sans" | "serif";
  /** Fonts a Word document may name that this one stands in for, lower case. */
  word: string[];
  /**
   * The font's single line height as a multiple of its size (its hhea
   * metrics), which is what Word's "single" spacing means for it — so a Word
   * import can turn Word's spacing into the PDF's.
   */
  line: number;
};

export const FONT_CHOICES: FontChoice[] = [
  { key: "Carlito", label: "Calibri (Carlito)", file: "carlito", kind: "sans", word: ["calibri", "calibri light", "carlito"], line: 1.22 },
  { key: "Arimo", label: "Arial (Arimo)", file: "arimo", kind: "sans", word: ["arial", "helvetica", "liberation sans", "arimo"], line: 1.15 },
  { key: "Tinos", label: "Times New Roman (Tinos)", file: "tinos", kind: "serif", word: ["times new roman", "times", "liberation serif", "tinos"], line: 1.15 },
  { key: "Gelasio", label: "Georgia (Gelasio)", file: "gelasio", kind: "serif", word: ["georgia", "gelasio"], line: 1.27 },
  { key: "Caladea", label: "Cambria (Caladea)", file: "caladea", kind: "serif", word: ["cambria", "caladea"], line: 1.15 },
  { key: "Open Sans", label: "Open Sans", file: "open-sans", kind: "sans", word: ["open sans", "segoe ui"], line: 1.36 },
  { key: "Lato", label: "Lato", file: "lato", kind: "sans", word: ["lato"], line: 1.2 },
  { key: "Roboto", label: "Roboto", file: "roboto", kind: "sans", word: ["roboto"], line: 1.17 },
  { key: "Montserrat", label: "Montserrat", file: "montserrat", kind: "sans", word: ["montserrat", "century gothic"], line: 1.22 },
  { key: "Merriweather", label: "Merriweather", file: "merriweather", kind: "serif", word: ["merriweather"], line: 1.26 },
  { key: "Playfair Display", label: "Playfair Display", file: "playfair-display", kind: "serif", word: ["playfair display", "playfair"], line: 1.33 },
];

const FONT_BY_KEY = new Map(FONT_CHOICES.map((f) => [f.key.toLowerCase(), f]));

/**
 * The offered font a CSS font-family value or a Word font name means, or null.
 * Reads the first family of a list and ignores quotes and case, so
 * `"Open Sans", sans-serif` and `open sans` both find Open Sans, and Calibri
 * finds its stand-in.
 */
export function fontChoice(name: string | null | undefined): FontChoice | null {
  if (!name) return null;
  const first = name.split(",")[0].trim().replace(/^['"]|['"]$/g, "").trim().toLowerCase();
  if (!first) return null;
  return FONT_BY_KEY.get(first) ?? FONT_CHOICES.find((f) => f.word.includes(first)) ?? null;
}

export function fontFile(choice: FontChoice, bold: boolean, italic: boolean): string {
  return `${choice.file}-${bold ? 700 : 400}-${italic ? "italic" : "normal"}.ttf`;
}

/** How a family is written in a CSS font-family value — quoted, so names with spaces survive. */
export function cssFontFamily(key: string): string {
  return `"${key}"`;
}

// ------------------------------------------------------------------ colours

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A colour as #rrggbb, from #rgb, #rrggbb, rgb()/rgba() or a Word hex value
 * without the hash; null for anything else, including "auto" and a fully
 * transparent rgba. The browser hands back rgb() for a colour it parsed out of
 * HTML, so the editor's round trip produces both forms.
 */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v || v === "auto" || v === "transparent" || v === "inherit" || v === "none") return null;
  if (HEX.test(v)) return v;
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (rgb) {
    if (rgb[4] !== undefined) {
      const alpha = rgb[4].endsWith("%") ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4]);
      if (alpha === 0) return null;
    }
    const hex = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("");
    return `#${hex}`;
  }
  return null;
}

/** The palette the builder's colour pickers open on: the HMARK colours first, then plain ones. */
export const PALETTE: { value: string; label: string }[] = [
  { value: "#52be96", label: "HMARK green" },
  { value: "#146856", label: "Deep green" },
  { value: "#eef8f4", label: "Mint" },
  { value: "#726f73", label: "Slate grey" },
  { value: "#4f81bd", label: "Blue" },
  { value: "#1f3864", label: "Navy" },
  { value: "#000000", label: "Black" },
  { value: "#404040", label: "Dark grey" },
  { value: "#808080", label: "Grey" },
  { value: "#d9d9d9", label: "Light grey" },
  { value: "#ffffff", label: "White" },
  { value: "#c00000", label: "Red" },
  { value: "#e36c09", label: "Orange" },
  { value: "#ffc000", label: "Amber" },
  { value: "#fff2cc", label: "Cream" },
  { value: "#7030a0", label: "Purple" },
];

// ------------------------------------------------------------------ bullets, numbers, money

export const BULLET_SHAPES = ["square", "disc", "circle", "dash", "arrow", "check", "diamond"] as const;
export type BulletShape = (typeof BULLET_SHAPES)[number];
export const BULLET_LABELS: Record<BulletShape, string> = {
  square: "▪ Square",
  disc: "• Round",
  circle: "◦ Hollow",
  dash: "– Dash",
  arrow: "➤ Arrow",
  check: "✓ Tick",
  diamond: "◆ Diamond",
};

export const NUMBER_FORMATS = ["decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];
export const NUMBER_LABELS: Record<NumberFormat, string> = {
  decimal: "1. 2. 3.",
  "lower-alpha": "a. b. c.",
  "upper-alpha": "A. B. C.",
  "lower-roman": "i. ii. iii.",
  "upper-roman": "I. II. III.",
};

function roman(n: number): string {
  const table: [number, string][] = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let out = "";
  for (const [value, glyph] of table) {
    while (n >= value) {
      out += glyph;
      n -= value;
    }
  }
  return out;
}

function alpha(n: number): string {
  let out = "";
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

/** A list number as its format writes it, with the trailing full stop. */
export function formatListNumber(n: number, format: NumberFormat | undefined): string {
  const safe = Math.max(1, Math.floor(n));
  switch (format) {
    case "lower-alpha":
      return `${alpha(safe)}.`;
    case "upper-alpha":
      return `${alpha(safe).toUpperCase()}.`;
    case "lower-roman":
      return `${roman(safe)}.`;
    case "upper-roman":
      return `${roman(safe).toUpperCase()}.`;
    default:
      return `${safe}.`;
  }
}

export type AmountFormat = { symbol: "before" | "after"; decimals: "always" | "when-needed" };

/**
 * An amount as a template prints it: "€2,100.00" (the Classic form), or
 * "2,100 €" as the reference contract writes it. "when-needed" drops ".00" but
 * keeps the cents of an amount that has them, so installments that do not
 * divide evenly still add up to the total on the page.
 */
export function formatAmount(symbol: string, n: number, format: AmountFormat = { symbol: "before", decimals: "always" }): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  const digits = format.decimals === "when-needed" && whole ? 0 : 2;
  const text = (digits === 0 ? Math.round(n) : n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return format.symbol === "after" ? `${text} ${symbol}` : `${symbol}${text}`;
}

// ------------------------------------------------------------------ the theme

export type HeadingStyle = {
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  /** A rule drawn under the heading, in this colour; null for none. */
  rule: string | null;
  spaceBefore: number;
  spaceAfter: number;
};

export type FeeRowLabel = { label: string; note: string };

export type Theme = {
  version: 1;
  /** The preset this design started from — shown in the panel, never used to fill it. */
  base: "reference" | "custom";
  page: { size: "A4" | "LETTER"; margin: number };
  body: { font: string; size: number; color: string; lineHeight: number; align: "left" | "justify"; spaceAfter: number };
  headings: [HeadingStyle, HeadingStyle, HeadingStyle];
  list: { bullet: BulletShape; color: string; numbering: NumberFormat; spaceAfter: number };
  table: { border: string; headerFill: string | null; headerText: string; totalFill: string | null };
  fee: {
    headerRow: boolean;
    paymentLabel: string;
    amountLabel: string;
    amount: AmountFormat;
    admin: FeeRowLabel;
    single: FeeRowLabel;
    /** Labels for a fee in two installments, then in three — the schedule differs, so the wording does too. */
    two: [FeeRowLabel, FeeRowLabel];
    three: [FeeRowLabel, FeeRowLabel, FeeRowLabel];
    visa: FeeRowLabel;
    total: string;
  };
  header: { title: string; titleColor: string; titleSize: number; ruleColor: string; ruleWidth: number; pageNumberColor: string; pageNumberSize: number };
};

// Read from the reference contract itself (reference/NEw Agreement Template):
// Calibri 10pt justified at Word's 1.05 line spacing (Carlito's single line is
// 1.22 of its size, so 1.28 here), section headings 11.5pt bold #52BE96 over a
// 0.75pt rule of the same green, sub-headings 10pt bold #726F73, green square
// bullets, a fee table with a #52BE96 header row, #726F73 borders and a #EEF8F4
// total row, amounts written "2,100 €", US Letter with half-inch margins, and
// a letterhead with a 2.25pt grey rule and the page number in #4F81BD.
export const REFERENCE_THEME: Theme = {
  version: 1,
  base: "reference",
  page: { size: "LETTER", margin: 36 },
  body: { font: "Carlito", size: 10, color: "#000000", lineHeight: 1.28, align: "justify", spaceAfter: 3 },
  headings: [
    { font: "Carlito", size: 11.5, color: "#52be96", bold: true, italic: false, rule: "#52be96", spaceBefore: 10, spaceAfter: 4 },
    { font: "Carlito", size: 10, color: "#726f73", bold: true, italic: false, rule: null, spaceBefore: 4, spaceAfter: 2 },
    { font: "Carlito", size: 10, color: "#000000", bold: true, italic: false, rule: null, spaceBefore: 4, spaceAfter: 2 },
  ],
  list: { bullet: "square", color: "#52be96", numbering: "decimal", spaceAfter: 2 },
  table: { border: "#726f73", headerFill: "#52be96", headerText: "#ffffff", totalFill: "#eef8f4" },
  fee: {
    headerRow: true,
    paymentLabel: "Payment",
    amountLabel: "Amount",
    amount: { symbol: "after", decimals: "when-needed" },
    admin: { label: "Administrative charges (non refundable), paid on signing", note: "" },
    single: { label: "Consultancy fee, paid on signing", note: "" },
    two: [
      { label: "First installment, paid on signing", note: "" },
      { label: "Second installment, paid on acceptance from the first university", note: "" },
    ],
    three: [
      { label: "First installment, paid on signing", note: "" },
      { label: "Second installment, paid in the following month", note: "" },
      { label: "Third installment, paid on acceptance from the first university", note: "" },
    ],
    visa: { label: "Visa documentation and application fee, paid on signing", note: "" },
    total: "Total Professional Fee",
  },
  header: { title: "Retainer Agreement", titleColor: "#000000", titleSize: 12, ruleColor: "#808080", ruleWidth: 2.25, pageNumberColor: "#4f81bd", pageNumberSize: 18 },
};

export const PAGE_MARGINS: { value: number; label: string }[] = [
  { value: 36, label: "Narrow — 0.5 in" },
  { value: 44, label: "Normal — 0.6 in (Classic)" },
  { value: 54, label: "Moderate — 0.75 in" },
  { value: 72, label: "Wide — 1 in" },
];

export const LINE_SPACINGS: { value: number; label: string }[] = [
  { value: 1, label: "1.0" },
  { value: 1.15, label: "1.15" },
  { value: 1.28, label: "1.28 (Word 1.05)" },
  { value: 1.35, label: "1.35" },
  { value: 1.5, label: "1.5" },
  { value: 1.75, label: "1.75" },
  { value: 2, label: "2.0" },
];

export const FONT_SIZES = [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14, 16, 18, 20, 24, 28, 32];

// ------------------------------------------------------------------ normalizing what is stored

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

function text(v: unknown, fallback: string, max = 200): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : fallback;
}

function color(v: unknown, fallback: string): string {
  return normalizeColor(v) ?? fallback;
}

/** A colour that may be switched off: null (or "") stays null, anything unreadable falls back. */
function optionalColor(v: unknown, fallback: string | null): string | null {
  if (v === null || v === "") return null;
  if (v === undefined) return fallback;
  return normalizeColor(v) ?? fallback;
}

function font(v: unknown, fallback: string): string {
  return typeof v === "string" ? fontChoice(v)?.key ?? fallback : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function heading(v: unknown, d: HeadingStyle): HeadingStyle {
  const h = isObj(v) ? v : {};
  return {
    font: font(h.font, d.font),
    size: num(h.size, d.size, 6, 40),
    color: color(h.color, d.color),
    bold: bool(h.bold, d.bold),
    italic: bool(h.italic, d.italic),
    rule: optionalColor(h.rule, d.rule),
    spaceBefore: num(h.spaceBefore, d.spaceBefore, 0, 48),
    spaceAfter: num(h.spaceAfter, d.spaceAfter, 0, 48),
  };
}

function feeRow(v: unknown, d: FeeRowLabel): FeeRowLabel {
  const r = isObj(v) ? v : {};
  // An empty label would print a row with an amount and nothing to say what it is.
  const label = text(r.label, d.label);
  return { label: label || d.label, note: text(r.note, d.note) };
}

/**
 * A complete, valid Theme from whatever was stored or submitted — or null,
 * meaning Classic. Every field is checked and anything missing or unreadable
 * takes the reference preset's value, so a design saved before a field existed
 * still renders, and a hand-edited request cannot put an unknown font or a
 * 400pt heading into a contract.
 */
export function normalizeTheme(input: unknown): Theme | null {
  let value = input;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "null") return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!isObj(value)) return null;
  const d = REFERENCE_THEME;
  const page = isObj(value.page) ? value.page : {};
  const body = isObj(value.body) ? value.body : {};
  const headings = Array.isArray(value.headings) ? value.headings : [];
  const list = isObj(value.list) ? value.list : {};
  const table = isObj(value.table) ? value.table : {};
  const fee = isObj(value.fee) ? value.fee : {};
  const amount = isObj(fee.amount) ? fee.amount : {};
  const header = isObj(value.header) ? value.header : {};
  const two = Array.isArray(fee.two) ? fee.two : [];
  const three = Array.isArray(fee.three) ? fee.three : [];

  return {
    version: 1,
    base: oneOf(value.base, ["reference", "custom"] as const, "custom"),
    page: { size: oneOf(page.size, ["A4", "LETTER"] as const, d.page.size), margin: num(page.margin, d.page.margin, 24, 96) },
    body: {
      font: font(body.font, d.body.font),
      size: num(body.size, d.body.size, 6, 16),
      color: color(body.color, d.body.color),
      lineHeight: num(body.lineHeight, d.body.lineHeight, 0.9, 3),
      align: oneOf(body.align, ["left", "justify"] as const, d.body.align),
      spaceAfter: num(body.spaceAfter, d.body.spaceAfter, 0, 36),
    },
    headings: [heading(headings[0], d.headings[0]), heading(headings[1], d.headings[1]), heading(headings[2], d.headings[2])],
    list: {
      bullet: oneOf(list.bullet, BULLET_SHAPES, d.list.bullet),
      color: color(list.color, d.list.color),
      numbering: oneOf(list.numbering, NUMBER_FORMATS, d.list.numbering),
      spaceAfter: num(list.spaceAfter, d.list.spaceAfter, 0, 36),
    },
    table: {
      border: color(table.border, d.table.border),
      headerFill: optionalColor(table.headerFill, d.table.headerFill),
      headerText: color(table.headerText, d.table.headerText),
      totalFill: optionalColor(table.totalFill, d.table.totalFill),
    },
    fee: {
      headerRow: bool(fee.headerRow, d.fee.headerRow),
      paymentLabel: text(fee.paymentLabel, d.fee.paymentLabel, 60),
      amountLabel: text(fee.amountLabel, d.fee.amountLabel, 60),
      amount: {
        symbol: oneOf(amount.symbol, ["before", "after"] as const, d.fee.amount.symbol),
        decimals: oneOf(amount.decimals, ["always", "when-needed"] as const, d.fee.amount.decimals),
      },
      admin: feeRow(fee.admin, d.fee.admin),
      single: feeRow(fee.single, d.fee.single),
      two: [feeRow(two[0], d.fee.two[0]), feeRow(two[1], d.fee.two[1])],
      three: [feeRow(three[0], d.fee.three[0]), feeRow(three[1], d.fee.three[1]), feeRow(three[2], d.fee.three[2])],
      visa: feeRow(fee.visa, d.fee.visa),
      total: text(fee.total, d.fee.total, 120) || d.fee.total,
    },
    header: {
      title: text(header.title, d.header.title, 80),
      titleColor: color(header.titleColor, d.header.titleColor),
      titleSize: num(header.titleSize, d.header.titleSize, 7, 20),
      ruleColor: color(header.ruleColor, d.header.ruleColor),
      ruleWidth: num(header.ruleWidth, d.header.ruleWidth, 0, 6),
      pageNumberColor: color(header.pageNumberColor, d.header.pageNumberColor),
      pageNumberSize: num(header.pageNumberSize, d.header.pageNumberSize, 7, 28),
    },
  };
}

// ------------------------------------------------------------------ the payment chart's rows

export type FeeFigures = {
  currencySymbol: string;
  adminCharge: number;
  consultancyFee: number;
  installmentAmounts: number[];
  discount: number | null;
  total: number;
  isBackup: boolean;
  destinationLabel: string;
  isVisaOnly?: boolean;
};

export type FeeRow = { label: string; note?: string; value: number; total?: boolean };

/**
 * The payment chart's rows under a theme: the same figures and order as the
 * Classic chart — the administrative charge, then the fee whole or in its
 * installments, then the total — in the template's own wording. The wording of
 * each installment depends on how many there are, because the schedule does:
 * of two, the second falls due on acceptance; of three, the second the month
 * after signing and the third on acceptance.
 */
export function themedFeeRows(fee: FeeFigures, labels: Theme["fee"]): FeeRow[] {
  const rows: FeeRow[] = [];
  const amounts = fee.installmentAmounts;
  const row = (l: FeeRowLabel, value: number): FeeRow => (l.note ? { label: l.label, note: l.note, value } : { label: l.label, value });
  const installments = () => {
    const set: FeeRowLabel[] | null = amounts.length === 2 ? labels.two : amounts.length === 3 ? labels.three : null;
    amounts.forEach((amount, i) => rows.push(row(set?.[i] ?? { label: `Installment ${i + 1}`, note: "" }, amount)));
  };

  if (fee.isVisaOnly) {
    if (amounts.length <= 1) rows.push(row(labels.visa, amounts[0] ?? fee.consultancyFee));
    else installments();
  } else if (fee.isBackup) {
    // A backup country's agreement charges its administrative fee and nothing else.
    rows.push({ label: `Administrative fee (${fee.destinationLabel})`, value: fee.adminCharge });
  } else {
    rows.push(row(labels.admin, fee.adminCharge));
    if (amounts.length <= 1) rows.push(row(labels.single, amounts[0] ?? fee.consultancyFee));
    else installments();
  }

  const discount = fee.discount && fee.discount > 0 ? fee.discount : 0;
  rows.push({
    label: labels.total,
    ...(discount ? { note: `Includes a discount of ${formatAmount(fee.currencySymbol, discount, labels.amount)}, already applied above` } : {}),
    value: fee.total,
    total: true,
  });
  return rows;
}
