// AEO Pakistan: the commission owed for each IELTS registration HMARK made
// there (0335) — reading the office's sheet, planning an import against what
// is stored, the totals, and the rows an export writes back.
//
// The sheet is the office's own: Sr. #, Candidate's Name, Challan Number,
// "challan creat date", Test date (one cell, as typed), Commission's Amount,
// Payment Status, and a Total row under it. Its challan dates are typed every
// way a person types a date — "27/09/2022", "001/8/2022" for 1 August, a real
// Excel date — and all of them are read as day/month/year.
//
// An import matches on the challan number: the same challan updates its row,
// a new one is added. A blank cell changes nothing (as every import here,
// importMerge.ts), so a partial sheet never wipes a column.
//
// Pure, so the unit tests import it directly (scripts/aeo-commissions-test.mjs).

export type PaymentStatus = "unpaid" | "paid";

/** A record as the table holds it. */
export type AeoRecord = {
  id: string;
  sr_no: number | null;
  candidate_name: string;
  challan_number: string;
  challan_date: string | null;
  test_details: string | null;
  commission_amount: number;
  payment_status: PaymentStatus;
  paid_on: string | null;
  payment_reference: string | null;
  notes: string | null;
};

export type AeoValues = Omit<AeoRecord, "id">;

export const AEO_COLUMNS =
  "id, sr_no, candidate_name, challan_number, challan_date, test_details, commission_amount, payment_status, paid_on, payment_reference, notes, updated_at";

export const LIMITS = { name: 200, challan: 60, test: 500, reference: 120, notes: 1000 } as const;

/** The sheet's columns, in its order — the office's seven, then the three the table adds. */
export const SHEET_COLUMNS = [
  { key: "sr_no", header: "Sr. #", width: 7 },
  { key: "candidate_name", header: "Candidate's Name", width: 32 },
  { key: "challan_number", header: "Challan Number", width: 18 },
  { key: "challan_date", header: "Challan create date", width: 20 },
  { key: "test_details", header: "Test date", width: 62 },
  { key: "commission_amount", header: "Commission's Amount", width: 21 },
  { key: "payment_status", header: "Payment Status", width: 16 },
  { key: "paid_on", header: "Paid on", width: 14 },
  { key: "payment_reference", header: "Payment reference", width: 22 },
  { key: "notes", header: "Notes", width: 40 },
] as const;

export type SheetKey = (typeof SHEET_COLUMNS)[number]["key"];

const squash = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Each column under the names a sheet may give it — the office's own spellings among them. */
const HEADER_ALIASES: Record<string, SheetKey> = {
  sr: "sr_no",
  srno: "sr_no",
  serial: "sr_no",
  serialno: "sr_no",
  candidatesname: "candidate_name",
  candidatename: "candidate_name",
  candidate: "candidate_name",
  name: "candidate_name",
  challannumber: "challan_number",
  challanno: "challan_number",
  challan: "challan_number",
  challancreatdate: "challan_date",
  challancreatedate: "challan_date",
  challancreationdate: "challan_date",
  challandate: "challan_date",
  testdate: "test_details",
  test: "test_details",
  testdetails: "test_details",
  commissionsamount: "commission_amount",
  commissionamount: "commission_amount",
  commission: "commission_amount",
  amount: "commission_amount",
  paymentstatus: "payment_status",
  status: "payment_status",
  paidon: "paid_on",
  datepaid: "paid_on",
  paiddate: "paid_on",
  paymentreference: "payment_reference",
  reference: "payment_reference",
  paymentref: "payment_reference",
  notes: "notes",
  note: "notes",
  remarks: "notes",
};

export function sheetKey(header: string): SheetKey | null {
  return HEADER_ALIASES[squash(header)] ?? null;
}

/** A sheet's row, by the table's own column names; headers it does not know are left out. */
export function keyedRow(row: Record<string, string>): Partial<Record<SheetKey, string>> {
  const out: Partial<Record<SheetKey, string>> = {};
  for (const [header, value] of Object.entries(row)) {
    const key = sheetKey(header);
    if (key && out[key] === undefined) out[key] = String(value ?? "").trim();
  }
  return out;
}

/** Whether a sheet's headers are this register's: a name and a challan number at least. */
export function looksLikeAeoSheet(headers: readonly string[]): boolean {
  const keys = new Set(headers.map(sheetKey));
  return keys.has("candidate_name") && keys.has("challan_number");
}

// ------------------------------------------------------------------ cells

const pad = (n: number) => String(n).padStart(2, "0");

function realDay(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * A date as the office types one, as YYYY-MM-DD — or an error.
 *
 * Day first, as in Pakistan: "27/09/2022", "7-1-2025", and "001/8/2022",
 * where a stray leading zero makes the day three digits. A year written
 * first ("2022/08/01") is read year first. A real date cell arrives as
 * YYYY-MM-DD already (spreadsheet.ts), and an unformatted one as Excel's day
 * number.
 */
export function parseDay(text: string | null | undefined): { day: string | null } | { error: string } {
  const value = (text ?? "").trim();
  if (!value) return { day: null };
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (iso) {
    const day = realDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return day ? { day } : { error: `"${value}" is not a real date` };
  }
  const parts = /^(\d{1,4})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})$/.exec(value);
  if (parts) {
    const [a, b, c] = [parts[1], parts[2], parts[3]];
    const yearFirst = a.length === 4 && c.length <= 2;
    const y = yearFirst ? Number(a) : c.length === 2 ? 2000 + Number(c) : Number(c);
    const m = Number(b);
    const d = yearFirst ? Number(c) : Number(a);
    const day = realDay(y, m, d);
    return day ? { day } : { error: `"${value}" is not a real date (day/month/year)` };
  }
  // Excel's day number, for a date cell read without its format.
  if (/^\d{5}(\.0+)?$/.test(value)) {
    const serial = Math.floor(Number(value));
    if (serial > 30000 && serial < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      return { day: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` };
    }
  }
  return { error: `"${value}" is not a date — write it day/month/year` };
}

/** An amount in rupees — "3000", "3,000", "Rs. 3,000", "PKR 3000.50" — or an error. */
export function parseAmount(text: string | null | undefined): { amount: number | null } | { error: string } {
  const value = (text ?? "").trim();
  if (!value) return { amount: null };
  const cleaned = value.replace(/^(pkr|rs\.?|rupees)\s*/i, "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { error: `"${value}" is not an amount` };
  const amount = Number(cleaned);
  if (amount > 9_999_999_999) return { error: `"${value}" is too large` };
  return { amount };
}

export function parseStatus(text: string | null | undefined): { status: PaymentStatus | null } | { error: string } {
  const value = (text ?? "").trim().toLowerCase();
  if (!value) return { status: null };
  if (value === "paid" || value === "received") return { status: "paid" };
  if (value === "unpaid" || value === "not paid" || value === "pending" || value === "due") return { status: "unpaid" };
  return { error: `"${text}" is not a payment status — write Paid or Unpaid` };
}

export function parseSrNo(text: string | null | undefined): { sr: number | null } | { error: string } {
  const value = (text ?? "").trim();
  if (!value) return { sr: null };
  if (!/^\d+(\.0+)?$/.test(value) || Number(value) < 1) return { error: `Sr. # "${value}" is not a number` };
  return { sr: Math.floor(Number(value)) };
}

/** A challan number as it is matched: spaces and case aside. */
export function challanKey(challan: string): string {
  return challan.trim().toLowerCase();
}

// ------------------------------------------------------------------ a row

/** What one sheet row says: each field it gives, null where its cell was blank. */
export type ReadRow = {
  line: number;
  sr_no: number | null;
  candidate_name: string | null;
  challan_number: string | null;
  challan_date: string | null;
  test_details: string | null;
  commission_amount: number | null;
  payment_status: PaymentStatus | null;
  paid_on: string | null;
  payment_reference: string | null;
  notes: string | null;
};

/** A cell's text, or null when blank. Windows line breaks become plain ones, so a sheet saved either way reads the same. */
const text = (v: string | undefined) => {
  const t = (v ?? "").replace(/\r\n?/g, "\n").trim();
  return t ? t : null;
};

/** One sheet row read, or why it cannot be. `line` is its row in the sheet, header being 1. */
export function readRow(cells: Partial<Record<SheetKey, string>>, line: number): { row: ReadRow } | { error: string } | { skip: true } {
  const name = text(cells.candidate_name);
  const challan = text(cells.challan_number);
  // The Total row, a blank row, a note under the table.
  if (!name && !challan) return { skip: true };
  const where = `Row ${line}${challan ? ` (challan ${challan})` : name ? ` (${name})` : ""}`;
  if (!challan) return { error: `${where}: no challan number — skipped` };

  const sr = parseSrNo(cells.sr_no);
  const date = parseDay(cells.challan_date);
  const amount = parseAmount(cells.commission_amount);
  const status = parseStatus(cells.payment_status);
  const paid = parseDay(cells.paid_on);
  for (const r of [sr, date, amount, status]) if ("error" in r) return { error: `${where}: ${r.error} — skipped` };
  if ("error" in paid) return { error: `${where}: Paid on ${paid.error} — skipped` };

  const row: ReadRow = {
    line,
    sr_no: "sr" in sr ? sr.sr : null,
    candidate_name: name,
    challan_number: challan,
    challan_date: "day" in date ? date.day : null,
    test_details: text(cells.test_details),
    commission_amount: "amount" in amount ? amount.amount : null,
    payment_status: "status" in status ? status.status : null,
    paid_on: "day" in paid ? paid.day : null,
    payment_reference: text(cells.payment_reference),
    notes: text(cells.notes),
  };
  const long: [string | null, number, string][] = [
    [row.candidate_name, LIMITS.name, "the name"],
    [row.challan_number, LIMITS.challan, "the challan number"],
    [row.test_details, LIMITS.test, "the test date"],
    [row.payment_reference, LIMITS.reference, "the payment reference"],
    [row.notes, LIMITS.notes, "the notes"],
  ];
  for (const [value, max, what] of long) if (value && value.length > max) return { error: `${where}: ${what} is longer than ${max} characters — skipped` };
  if (row.payment_status === "unpaid" && (row.paid_on || row.payment_reference)) {
    return { error: `${where}: says Unpaid but has a date paid or a reference — skipped` };
  }
  return { row };
}

// ------------------------------------------------------------------ the plan

const FIELD_LABELS: Record<keyof AeoValues, string> = {
  sr_no: "Sr. #",
  candidate_name: "name",
  challan_number: "challan",
  challan_date: "challan date",
  test_details: "test date",
  commission_amount: "commission",
  payment_status: "status",
  paid_on: "paid on",
  payment_reference: "reference",
  notes: "notes",
};

const shown = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export type AeoUpdate = { id: string; challan: string; values: Partial<AeoValues>; lines: string[] };

export type AeoPlan = {
  creates: AeoValues[];
  additions: string[];
  updates: AeoUpdate[];
  unchanged: number;
  problems: string[];
  /** No row had both a name and a challan: probably not this register's sheet. */
  empty: boolean;
};

/**
 * What an import would do: the rows to add, the fields to change on rows
 * already there, and the rows it cannot use and why — worked out before
 * anything is written, so the preview and the import are the same thing.
 */
export function planAeoImport(cells: readonly Partial<Record<SheetKey, string>>[], stored: readonly AeoRecord[], firstLine = 2): AeoPlan {
  const byChallan = new Map(stored.map((r) => [challanKey(r.challan_number), r]));
  const plan: AeoPlan = { creates: [], additions: [], updates: [], unchanged: 0, problems: [], empty: true };
  const seen = new Map<string, number>();
  // A new row with no Sr. # is numbered after the highest on file or in the sheet.
  const sheetSrs = cells.map((c) => {
    const s = parseSrNo(c.sr_no);
    return "sr" in s ? (s.sr ?? 0) : 0;
  });
  let nextSr = Math.max(0, ...stored.map((r) => r.sr_no ?? 0), ...sheetSrs);

  cells.forEach((c, i) => {
    const line = firstLine + i;
    const read = readRow(c, line);
    if ("skip" in read) return;
    if ("error" in read) {
      plan.problems.push(read.error);
      return;
    }
    const row = read.row;
    plan.empty = false;
    const key = challanKey(row.challan_number!);
    if (seen.has(key)) {
      plan.problems.push(`Row ${line} (challan ${row.challan_number}): the same challan is on row ${seen.get(key)} — skipped`);
      return;
    }
    seen.set(key, line);

    const existing = byChallan.get(key);
    if (!existing) {
      if (!row.candidate_name) {
        plan.problems.push(`Row ${line} (challan ${row.challan_number}): a new challan needs the candidate's name — skipped`);
        return;
      }
      // Every key on every row: a batch insert takes the union of the keys (AGENTS.md).
      const values: AeoValues = {
        sr_no: row.sr_no ?? ++nextSr,
        candidate_name: row.candidate_name,
        challan_number: row.challan_number!,
        challan_date: row.challan_date,
        test_details: row.test_details,
        commission_amount: row.commission_amount ?? 0,
        payment_status: row.payment_status ?? (row.paid_on || row.payment_reference ? "paid" : "unpaid"),
        paid_on: row.paid_on,
        payment_reference: row.payment_reference,
        notes: row.notes,
      };
      plan.creates.push(values);
      plan.additions.push(`Challan ${values.challan_number} · ${values.candidate_name} — ${formatPkr(values.commission_amount)}, ${values.payment_status}`);
      return;
    }

    // A blank cell says nothing. A date paid or a reference with no status means paid.
    const given: Partial<AeoValues> = {};
    for (const k of [
      "sr_no",
      "candidate_name",
      "challan_date",
      "test_details",
      "commission_amount",
      "payment_status",
      "paid_on",
      "payment_reference",
      "notes",
    ] as const) {
      if (row[k] !== null) (given as Record<string, unknown>)[k] = row[k];
    }
    if (given.payment_status === undefined && (given.paid_on || given.payment_reference)) given.payment_status = "paid";
    // Marked unpaid: its payment's date and reference go with it.
    if (given.payment_status === "unpaid") {
      given.paid_on = null;
      given.payment_reference = null;
    }

    const values: Partial<AeoValues> = {};
    const lines: string[] = [];
    for (const [k, v] of Object.entries(given) as [keyof AeoValues, AeoValues[keyof AeoValues]][]) {
      const before = existing[k];
      const same = k === "commission_amount" ? Number(before) === Number(v) : (before ?? null) === (v ?? null);
      if (same) continue;
      (values as Record<string, unknown>)[k] = v;
      lines.push(
        `Challan ${existing.challan_number} · ${FIELD_LABELS[k]} ${shown(k === "commission_amount" ? formatPkr(Number(before)) : before)} → ${shown(k === "commission_amount" ? formatPkr(Number(v)) : v)}`,
      );
    }
    if (lines.length === 0) plan.unchanged += 1;
    else plan.updates.push({ id: existing.id, challan: existing.challan_number, values, lines });
  });
  return plan;
}

// ------------------------------------------------------------------ figures

export function formatPkr(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  return `PKR ${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export type AeoTotals = { count: number; earned: number; paid: number; outstanding: number; paidCount: number; unpaidCount: number };

export function aeoTotals(records: readonly Pick<AeoRecord, "commission_amount" | "payment_status">[]): AeoTotals {
  const t: AeoTotals = { count: records.length, earned: 0, paid: 0, outstanding: 0, paidCount: 0, unpaidCount: 0 };
  for (const r of records) {
    const amount = Number(r.commission_amount) || 0;
    t.earned += amount;
    if (r.payment_status === "paid") {
      t.paid += amount;
      t.paidCount += 1;
    } else {
      t.outstanding += amount;
      t.unpaidCount += 1;
    }
  }
  // Two decimals at most, so 0.1 + 0.2 does not print as 0.30000000000000004.
  for (const k of ["earned", "paid", "outstanding"] as const) t[k] = Math.round(t[k] * 100) / 100;
  return t;
}

/** The order the table and the export use: by challan date, oldest first, as the office's sheet runs. */
export function compareRecords(a: AeoRecord, b: AeoRecord): number {
  const da = a.challan_date ?? "9999-12-31";
  const db = b.challan_date ?? "9999-12-31";
  return da.localeCompare(db) || a.challan_number.localeCompare(b.challan_number, undefined, { numeric: true });
}

/** A search and the filters, as the page applies them — the export applies the same. */
export type AeoFilter = { q?: string; status?: PaymentStatus | "all"; year?: string };

export function matchesFilter(r: AeoRecord, f: AeoFilter): boolean {
  if (f.status && f.status !== "all" && r.payment_status !== f.status) return false;
  if (f.year && f.year !== "all" && (r.challan_date ?? "").slice(0, 4) !== f.year) return false;
  const q = (f.q ?? "").trim().toLowerCase();
  if (q) {
    const hay = [r.candidate_name, r.challan_number, r.test_details, r.payment_reference, r.notes, r.sr_no].filter(Boolean).join(" ").toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** The years the challans fall in, newest first, for the filter. */
export function challanYears(records: readonly Pick<AeoRecord, "challan_date">[]): string[] {
  return [...new Set(records.map((r) => (r.challan_date ?? "").slice(0, 4)).filter(Boolean))].sort().reverse();
}

/** "13/10/2025", as the office writes dates. */
export function dmy(day: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export const STATUS_LABEL: Record<PaymentStatus, string> = { unpaid: "Unpaid", paid: "Paid" };

/** The form's fields read, for adding or editing one record. */
export function readForm(get: (name: string) => string): { values: AeoValues } | { error: string } {
  const cells: Partial<Record<SheetKey, string>> = {};
  for (const c of SHEET_COLUMNS) cells[c.key] = get(c.key);
  // The form hides the payment's date and reference while Unpaid is chosen; whatever they still hold is not meant.
  if ((cells.payment_status ?? "").trim().toLowerCase() !== "paid") {
    cells.paid_on = "";
    cells.payment_reference = "";
  }
  const read = readRow(cells, 0);
  if ("skip" in read) return { error: "Enter the candidate's name and the challan number." };
  if ("error" in read) return { error: read.error.replace(/^Row 0[^:]*: /, "").replace(/ — skipped$/, ".") };
  const r = read.row;
  if (!r.candidate_name) return { error: "Enter the candidate's name." };
  const status = r.payment_status ?? "unpaid";
  return {
    values: {
      sr_no: r.sr_no,
      candidate_name: r.candidate_name,
      challan_number: r.challan_number!,
      challan_date: r.challan_date,
      test_details: r.test_details,
      commission_amount: r.commission_amount ?? 0,
      payment_status: status,
      paid_on: status === "paid" ? r.paid_on : null,
      payment_reference: status === "paid" ? r.payment_reference : null,
      notes: r.notes,
    },
  };
}
