import { parse, type Node, HTMLElement, NodeType } from "node-html-parser";
import type { AgreementBlock, RichListItem, TextRun } from "./agreementContent";

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
  { key: "discount", label: "Discount amount, formatted with currency (blank if none)" },
  { key: "total_fee", label: "Total professional fee (admin charge + consultancy fee - discount), formatted with currency" },
  { key: "currency", label: "Currency code (e.g. \"EUR\")" },
  { key: "agreement_date", label: "The date the agreement was generated" },
  { key: "signatory_name", label: "The template's fixed authorized signatory" },
  { key: "fee_table", label: "The itemized fee table — put this on its own paragraph where you want it to appear (otherwise it's added automatically after the last clause)" },
];

export function renderMergeFields(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

function extractRuns(node: Node, active: { bold: boolean; italic: boolean; underline: boolean } = { bold: false, italic: false, underline: false }): TextRun[] {
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = node.rawText;
    if (!text || !text.trim()) return [];
    return [{ text: text.replace(/\s+/g, " "), bold: active.bold || undefined, italic: active.italic || undefined, underline: active.underline || undefined }];
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return [];
  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();
  const next = {
    bold: active.bold || tag === "strong" || tag === "b",
    italic: active.italic || tag === "em" || tag === "i",
    underline: active.underline || tag === "u",
  };
  if (tag === "br") return [{ text: "\n" }];
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
function looksLikeFeeTable(rows: { cells: TextRun[][] }[]): boolean {
  return rows.some((row) =>
    row.cells.some((cell) => /professional fee/i.test(cell.map((run) => run.text).join("")))
  );
}

const LIST_TAGS = new Set(["ul", "ol"]);

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

  const liEls = listEl.childNodes.filter(
    (c) => c.nodeType === NodeType.ELEMENT_NODE && (c as HTMLElement).tagName?.toLowerCase() === "li"
  ) as HTMLElement[];

  for (const li of liEls) {
    const isNestedList = (c: Node) => c.nodeType === NodeType.ELEMENT_NODE && LIST_TAGS.has((c as HTMLElement).tagName?.toLowerCase() ?? "");
    const ownRuns = li.childNodes.filter((c) => !isNestedList(c)).flatMap((c) => extractRuns(c));
    if (ownRuns.length) {
      // A {{fee_table}} placeholder occupying its own <li> (see wordingToBlocks'
      // list-splitting below) isn't a real clause — it shouldn't consume a
      // number, so real items keep counting up sequentially around it.
      const isPlaceholder = isFeeTablePlaceholder(ownRuns.map((r) => r.text).join(""));
      items.push({ runs: ownRuns, indent: depth, ordered, number: ordered && !isPlaceholder ? nextNumber : undefined });
      if (ordered && !isPlaceholder) nextNumber += 1;
    }
    for (const nested of li.childNodes.filter(isNestedList) as HTMLElement[]) {
      items.push(...flattenListItems(nested, nested.tagName?.toLowerCase() === "ol", depth + 1));
    }
  }

  return items;
}

// Converts a super-admin-authored wording blob (rich HTML from the TipTap
// editor, or from a Word-upload's mammoth.convertToHtml output) into the
// same AgreementBlock[] shape AgreementDocument already renders — so no
// separate rendering path is needed for template-driven wording. The
// itemized fee table renders wherever the wording places a {{fee_table}}
// placeholder, or as its own fixed section straight after the narrative if
// the wording never mentions it.
export function wordingToBlocks(wording: string, vars: Record<string, string>): AgreementBlock[] {
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
    if (!blocks.some((b) => b.kind === "feeTable")) blocks.push({ kind: "feeTable" });
    return blocks;
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
      if (runs.length) blocks.push({ kind: "richHeading", level, runs, indent: readIndentLevel(el) });
    } else if (tag === "p") {
      const runs = extractRuns(el);
      if (runs.length) {
        const text = runs.map((r) => r.text).join("");
        blocks.push(isFeeTablePlaceholder(text) ? { kind: "feeTable" } : { kind: "richParagraph", runs, indent: readIndentLevel(el) });
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
      const rows: { cells: TextRun[][]; header: boolean }[] = [];
      const rowEls = el.querySelectorAll("tr");
      for (const tr of rowEls) {
        const cellEls = tr.childNodes.filter(
          (c) => c.nodeType === NodeType.ELEMENT_NODE && ["td", "th"].includes((c as HTMLElement).tagName?.toLowerCase() ?? "")
        ) as HTMLElement[];
        if (cellEls.length === 0) continue;
        const header = cellEls.every((c) => c.tagName?.toLowerCase() === "th");
        rows.push({ cells: cellEls.map((c) => extractRuns(c)), header });
      }
      if (rows.length) blocks.push(looksLikeFeeTable(rows) ? { kind: "feeTable" } : { kind: "richTable", rows });
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

  if (!blocks.some((b) => b.kind === "feeTable")) blocks.push({ kind: "feeTable" });
  return blocks;
}

export const DEFAULT_OFFICE_LINE =
  "HMARK Consultants - Office Address: Suite 101, Dashtiyar Chambers, Opp. Urdu Federal University, Gulshan-e-Iqbal, Block 13-C, University Road, Karachi, Pakistan. Landline #: 021 34 999 777";
