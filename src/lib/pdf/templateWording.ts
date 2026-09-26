import { parse, type Node, HTMLElement, NodeType } from "node-html-parser";
import type { AgreementBlock, BlockFormat, RichCell, RichListItem, TextRun } from "./agreementContent";
import { BULLET_SHAPES, NUMBER_FORMATS, fontChoice, normalizeColor, type BulletShape, type NumberFormat } from "./agreementTheme.ts";
import { COMPANY_MERGE_FIELDS } from "../agreementCompany.ts";

// Matches the px-per-level the builder's Increase/Decrease Indent buttons
// write via the `indent` node attribute's renderHTML (see the Indent
// extension in RichTextEditor.tsx) — must stay in sync with that value.
const INDENT_STEP_PX = 24;

function readIndentLevel(el: HTMLElement): number | undefined {
  const match = /margin-left:\s*(\d+)px/.exec(el.getAttribute("style") ?? "");
  if (!match) return undefined;
  const level = Math.round(Number(match[1]) / INDENT_STEP_PX);
  return level > 0 ? level : undefined;
}

// Every super-admin-authored template's wording can reference these via
// {{fieldName}} — substituted per student at generation time. Keep this in
// sync with the `vars` object built in generateAgreementPdf (agreements.ts).
export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "student_name", label: "Student's full name" },
  { key: "destination", label: "Destination display name (e.g. \"Germany (Public)\")" },
  { key: "admin_charge", label: "Administrative charge, formatted with currency (e.g. \"€450.00\")" },
  { key: "consultancy_fee", label: "Consultancy fee, formatted with currency" },
  { key: "visa_service_fee", label: "Visa documentation & application fee, formatted with currency (visa-service templates)" },
  { key: "discount", label: "Discount amount, formatted with currency (blank if none)" },
  { key: "total_fee", label: "Total professional fee (admin charge + consultancy fee - discount), formatted with currency" },
  { key: "currency", label: "Currency code (e.g. \"EUR\")" },
  { key: "agreement_date", label: "The date the agreement was generated" },
  { key: "signatory_name", label: "The template's fixed authorized signatory" },
  ...COMPANY_MERGE_FIELDS,
  { key: "fee_table", label: "The itemized fee table — put this on its own paragraph where you want it to appear (otherwise it's added automatically after the last clause)" },
];

export function renderMergeFields(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

// ------------------------------------------------------------ reading styles
//
// The builder writes its formatting as inline CSS (TipTap's text-style marks
// and text-align) and data- attributes (its own paragraph, list and table
// options — see RichTextEditor). Each reader returns undefined for anything it
// does not recognise, so a template that never used a tool parses exactly as
// it did before the tool existed.

function styleOf(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of (el.getAttribute("style") ?? "").split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (prop && value) out[prop] = value;
  }
  return out;
}

/** A CSS length in points: "10pt", "13.33px" (at 96 dpi), or a bare number taken as points. */
function points(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^(-?[\d.]+)\s*(pt|px)?$/i.exec(value.trim());
  if (!m) return undefined;
  const n = Number(m[1]) * (m[2]?.toLowerCase() === "px" ? 0.75 : 1);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

function unitless(value: string | undefined): number | undefined {
  if (!value || !/^[\d.]+$/.test(value.trim())) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const ALIGNS = new Set(["left", "center", "right", "justify"]);

function alignOf(el: HTMLElement): BlockFormat["align"] {
  const a = styleOf(el)["text-align"]?.toLowerCase();
  return a && ALIGNS.has(a) ? (a as BlockFormat["align"]) : undefined;
}

function readBlockFormat(el: HTMLElement): BlockFormat | undefined {
  const style = styleOf(el);
  const format: BlockFormat = {};
  const align = alignOf(el);
  if (align) format.align = align;
  const lineHeight = unitless(el.getAttribute("data-line-height") ?? style["line-height"]);
  if (lineHeight) format.lineHeight = Math.min(3, lineHeight);
  const before = points(el.getAttribute("data-space-before") ?? undefined);
  if (before !== undefined) format.spaceBefore = Math.min(72, before);
  const after = points(el.getAttribute("data-space-after") ?? undefined);
  if (after !== undefined) format.spaceAfter = Math.min(72, after);
  const rule = normalizeColor(el.getAttribute("data-rule"));
  if (rule) format.rule = rule;
  const shade = normalizeColor(el.getAttribute("data-shade"));
  if (shade) format.shade = shade;
  return Object.keys(format).length ? format : undefined;
}

// ------------------------------------------------------------ runs

type RunStyle = Omit<TextRun, "text">;

const INLINE_TAGS = new Set(["strong", "b", "em", "i", "u", "s", "strike", "del", "span", "mark", "a", "sub", "sup", "code", "small", "font"]);

const isInline = (n: Node | undefined) =>
  !!n && (n.nodeType === NodeType.TEXT_NODE || (n.nodeType === NodeType.ELEMENT_NODE && INLINE_TAGS.has((n as HTMLElement).tagName?.toLowerCase() ?? "")));

function runFrom(text: string, active: RunStyle): TextRun {
  const run: TextRun = { text, bold: active.bold || undefined, italic: active.italic || undefined, underline: active.underline || undefined };
  if (active.strike) run.strike = true;
  if (active.color) run.color = active.color;
  if (active.highlight) run.highlight = active.highlight;
  if (active.font) run.font = active.font;
  if (active.size) run.size = active.size;
  return run;
}

function extractRuns(node: Node, active: RunStyle = { bold: false, italic: false, underline: false }): TextRun[] {
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = node.rawText;
    if (!text) return [];
    if (!text.trim()) {
      // A space on its own between two formatted words — "<strong>A</strong>
      // <em>B</em>" — is part of the sentence; the same whitespace between
      // block elements is only source formatting.
      const parent = node.parentNode;
      const siblings = parent ? parent.childNodes : [];
      const i = siblings.indexOf(node);
      if (i > 0 && isInline(siblings[i - 1]) && isInline(siblings[i + 1])) return [runFrom(" ", active)];
      return [];
    }
    return [runFrom(text.replace(/\s+/g, " "), active)];
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return [];
  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();
  if (tag === "br") return [{ text: "\n" }];

  const next: RunStyle = {
    ...active,
    bold: active.bold || tag === "strong" || tag === "b",
    italic: active.italic || tag === "em" || tag === "i",
    underline: active.underline || tag === "u",
  };
  if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
  if (tag === "span" || tag === "mark" || tag === "font") {
    const style = styleOf(el);
    const color = normalizeColor(style.color ?? el.getAttribute("color"));
    if (color) next.color = color;
    const highlight = normalizeColor(style["background-color"] ?? style.background ?? (tag === "mark" ? el.getAttribute("data-color") : null));
    if (highlight) next.highlight = highlight;
    const font = fontChoice(style["font-family"] ?? el.getAttribute("face"))?.key;
    if (font) next.font = font;
    const size = points(style["font-size"]);
    if (size) next.size = Math.min(72, Math.max(5, size));
  }
  return el.childNodes.flatMap((child) => extractRuns(child, next));
}

// A paragraph containing nothing but the {{fee_table}} placeholder marks
// where the itemized fee table should be inserted, so authors can place it
// inside a billing clause instead of always at the end.
const isFeeTablePlaceholder = (text: string) => text.trim().toLowerCase() === "{{fee_table}}";

// Staff repeatedly pasted/typed a literal table of sample fee figures
// (typed by hand, or carried over from a .docx upload) instead of using the
// {{fee_table}} placeholder or the editor's "+ Payment Chart" button — every
// one of those tables, and every one of HMARK's real contracts, opens with a
// "Total Professional Fee" row, so a table matching that heading is treated
// as the fee table's intended position and replaced with the real one
// automatically, with no action required from whoever authored the wording.
function looksLikeFeeTable(rows: { cells: RichCell[] }[]): boolean {
  return rows.some((row) =>
    row.cells.some((cell) => /professional fee/i.test(cell.runs.map((run) => run.text).join("")))
  );
}

const LIST_TAGS = new Set(["ul", "ol"]);

const OL_TYPES: Record<string, NumberFormat | undefined> = {
  "1": "decimal",
  a: "lower-alpha",
  A: "upper-alpha",
  i: "lower-roman",
  I: "upper-roman",
};

const childElements = (el: HTMLElement, tags: string[]) =>
  el.childNodes.filter(
    (c) => c.nodeType === NodeType.ELEMENT_NODE && tags.includes((c as HTMLElement).tagName?.toLowerCase() ?? "")
  ) as HTMLElement[];

// Walks a <ul>/<ol> depth-first, flattening every nested sub-list (produced
// by pressing Tab on a list item in the builder — see RichTextEditor's
// sinkListItem wiring) into one ordered sequence of items carrying their own
// nesting depth, so a multi-level outline round-trips correctly into the
// PDF. Each sub-list gets its own fresh 1-based counter when ordered,
// matching Word's own behavior (numbering restarts under each parent item
// rather than continuing across siblings).
function flattenListItems(listEl: HTMLElement, ordered: boolean, depth: number): RichListItem[] {
  const items: RichListItem[] = [];
  const startAttr = Number(listEl.getAttribute("start") ?? "1");
  let nextNumber = Number.isFinite(startAttr) && startAttr > 0 ? startAttr : 1;

  // The list's own choices in the builder: which bullet or numbering, and in
  // what colour. A list that never chose takes the look's default.
  const bulletAttr = listEl.getAttribute("data-bullet");
  const bullet = bulletAttr && (BULLET_SHAPES as readonly string[]).includes(bulletAttr) ? (bulletAttr as BulletShape) : undefined;
  // Numbering rides on the list's own `type` (a, A, i, I), as the editor writes it.
  const numberingAttr = listEl.getAttribute("data-numbering") ?? OL_TYPES[listEl.getAttribute("type") ?? ""];
  const numbering = numberingAttr && (NUMBER_FORMATS as readonly string[]).includes(numberingAttr) ? (numberingAttr as NumberFormat) : undefined;
  const markerColor = normalizeColor(listEl.getAttribute("data-marker-color")) ?? undefined;

  for (const li of childElements(listEl, ["li"])) {
    const isNestedList = (c: Node) => c.nodeType === NodeType.ELEMENT_NODE && LIST_TAGS.has((c as HTMLElement).tagName?.toLowerCase() ?? "");
    const ownRuns = li.childNodes.filter((c) => !isNestedList(c)).flatMap((c) => extractRuns(c));
    if (ownRuns.length) {
      // A {{fee_table}} placeholder occupying its own <li> (see wordingToBlocks'
      // list-splitting below) isn't a real clause — it shouldn't consume a
      // number, so real items keep counting up sequentially around it.
      const isPlaceholder = isFeeTablePlaceholder(ownRuns.map((r) => r.text).join(""));
      const item: RichListItem = { runs: ownRuns, indent: depth, ordered, number: ordered && !isPlaceholder ? nextNumber : undefined };
      if (bullet && !ordered) item.bullet = bullet;
      if (numbering && ordered) item.numbering = numbering;
      if (markerColor) item.markerColor = markerColor;
      // The builder keeps an item's text in a paragraph, which is where its
      // alignment and spacing live.
      const para = childElements(li, ["p"])[0];
      const format = para ? readBlockFormat(para) : undefined;
      if (format) item.format = format;
      items.push(item);
      if (ordered && !isPlaceholder) nextNumber += 1;
    }
    for (const nested of li.childNodes.filter(isNestedList) as HTMLElement[]) {
      items.push(...flattenListItems(nested, nested.tagName?.toLowerCase() === "ol", depth + 1));
    }
  }

  return items;
}

// A table's rows, with each cell's alignment, background and span, and the
// column widths the builder was dragged to (TipTap writes them as `colwidth`
// on the cells of the first row).
function readTable(el: HTMLElement): Extract<AgreementBlock, { kind: "richTable" }> | null {
  const rows: { cells: RichCell[]; header: boolean }[] = [];
  let widths: number[] | undefined;
  for (const tr of el.querySelectorAll("tr")) {
    const cellEls = childElements(tr, ["td", "th"]);
    if (cellEls.length === 0) continue;
    const header = cellEls.every((c) => c.tagName?.toLowerCase() === "th");
    const cells = cellEls.map((c): RichCell => {
      const cell: RichCell = { runs: extractRuns(c) };
      const para = childElements(c, ["p"])[0];
      const align = para ? alignOf(para) : alignOf(c);
      if (align) cell.align = align;
      const fill = normalizeColor(c.getAttribute("data-fill") ?? styleOf(c)["background-color"]);
      if (fill) cell.fill = fill;
      const span = Number(c.getAttribute("colspan") ?? "1");
      if (Number.isFinite(span) && span > 1) cell.colspan = Math.min(20, Math.floor(span));
      return cell;
    });
    if (!widths) {
      const cols: (number | null)[] = [];
      for (const c of cellEls) {
        const span = Math.max(1, Math.floor(Number(c.getAttribute("colspan") ?? "1")) || 1);
        const each = (c.getAttribute("colwidth") ?? "").split(",").map((w) => Number(w));
        for (let i = 0; i < span; i++) cols.push(Number.isFinite(each[i]) && each[i] > 0 ? each[i] : null);
      }
      if (cols.some((w) => w !== null)) {
        // Columns never dragged share what the dragged ones leave, at their average width.
        const set = cols.filter((w): w is number => w !== null);
        const fallback = set.reduce((a, b) => a + b, 0) / set.length;
        const filled = cols.map((w) => w ?? fallback);
        const total = filled.reduce((a, b) => a + b, 0);
        widths = filled.map((w) => Math.round((w / total) * 10000) / 10000);
      }
    }
    rows.push({ cells, header });
  }
  if (!rows.length) return null;
  const table: Extract<AgreementBlock, { kind: "richTable" }> = { kind: "richTable", rows };
  if (widths) table.widths = widths;
  const border = normalizeColor(el.getAttribute("data-border"));
  if (border) table.border = border;
  return table;
}

// Converts a super-admin-authored wording blob (rich HTML from the TipTap
// editor, or from a Word import) into the same AgreementBlock[] shape
// AgreementDocument already renders — so no separate rendering path is
// needed for template-driven wording. The itemized fee table renders
// wherever the wording places a {{fee_table}} placeholder, or as its own
// fixed section straight after the narrative if the wording never mentions it.
export function wordingToBlocks(
  wording: string,
  vars: Record<string, string>,
  // Off for a staff agreement, which has no student fee table: then nothing is
  // appended, and a table that merely mentions a fee stays the table it is.
  { feeTable = true }: { feeTable?: boolean } = {}
): AgreementBlock[] {
  const rendered = renderMergeFields(wording, vars);

  // Templates saved before the rich-text (HTML) editor was added stored
  // plain text, paragraphs separated by a blank line, with no HTML tags at
  // all — node-html-parser would otherwise treat that as a single text
  // node with no element children and silently produce zero blocks.
  if (!/<[a-z][\s\S]*>/i.test(rendered)) {
    const paragraphs = rendered
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    const blocks: AgreementBlock[] = paragraphs.map(
      (text): AgreementBlock => (isFeeTablePlaceholder(text) ? { kind: "feeTable" } : { kind: "richParagraph", runs: [{ text }] })
    );
    if (feeTable && !blocks.some((b) => b.kind === "feeTable")) blocks.push({ kind: "feeTable" });
    return feeTable ? blocks : blocks.filter((b) => b.kind !== "feeTable");
  }

  const root = parse(rendered);
  const blocks: AgreementBlock[] = [];

  for (const node of root.childNodes) {
    if (node.nodeType !== NodeType.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName?.toLowerCase();

    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
      const level = Math.min(3, Number(tag[1])) as 1 | 2 | 3;
      const runs = extractRuns(el);
      const format = readBlockFormat(el);
      if (runs.length) blocks.push({ kind: "richHeading", level, runs, indent: readIndentLevel(el), ...(format ? { format } : {}) });
    } else if (tag === "p") {
      const runs = extractRuns(el);
      if (runs.length) {
        const text = runs.map((r) => r.text).join("");
        const format = readBlockFormat(el);
        blocks.push(
          isFeeTablePlaceholder(text) ? { kind: "feeTable" } : { kind: "richParagraph", runs, indent: readIndentLevel(el), ...(format ? { format } : {}) }
        );
      }
    } else if (tag === "ul" || tag === "ol") {
      // Rich text editors turn Enter-inside-a-list-item into a new list
      // item, so a {{fee_table}} placeholder typed there ends up nested in
      // an <li> rather than breaking out to its own paragraph. Split the
      // list around it instead of rendering the token as inert list text —
      // each item already carries its own correct number (computed while
      // flattening, before any splitting), so no numbering continuity logic
      // is needed here.
      const flatItems = flattenListItems(el, tag === "ol", 0);
      let items: RichListItem[] = [];
      for (const item of flatItems) {
        const text = item.runs.map((r) => r.text).join("");
        if (isFeeTablePlaceholder(text)) {
          if (items.length) {
            blocks.push({ kind: "richList", items });
            items = [];
          }
          blocks.push({ kind: "feeTable" });
        } else {
          items.push(item);
        }
      }
      if (items.length) blocks.push({ kind: "richList", items });
    } else if (tag === "table") {
      const table = readTable(el);
      if (table) blocks.push(feeTable && looksLikeFeeTable(table.rows) ? { kind: "feeTable" } : table);
    } else if (tag === "div" && el.hasAttribute("data-page-break")) {
      blocks.push({ kind: "pageBreak" });
    } else if (tag === "hr") {
      const color = normalizeColor(el.getAttribute("data-color"));
      blocks.push(color ? { kind: "rule", color } : { kind: "rule" });
    } else {
      // Any other block-level tag (div, blockquote, etc.) — treat its text
      // content as a plain paragraph rather than silently dropping it.
      const runs = extractRuns(el);
      if (runs.length) {
        const text = runs.map((r) => r.text).join("");
        blocks.push(isFeeTablePlaceholder(text) ? { kind: "feeTable" } : { kind: "richParagraph", runs });
      }
    }
  }

  if (feeTable && !blocks.some((b) => b.kind === "feeTable")) blocks.push({ kind: "feeTable" });
  return feeTable ? blocks : blocks.filter((b) => b.kind !== "feeTable");
}

