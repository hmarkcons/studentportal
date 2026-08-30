import { parse, type Node, HTMLElement, NodeType } from "node-html-parser";
import type { AgreementBlock, TextRun } from "./agreementContent";

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

// Converts a super-admin-authored wording blob (rich HTML from the TipTap
// editor, or from a Word-upload's mammoth.convertToHtml output) into the
// same AgreementBlock[] shape AgreementDocument already renders — so no
// separate rendering path is needed for template-driven wording. The
// itemized fee table always renders as its own fixed section straight
// after the narrative, regardless of what the wording says.
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
    return [...paragraphs.map((text): AgreementBlock => ({ kind: "richParagraph", runs: [{ text }] })), { kind: "feeTable" }];
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
      if (runs.length) blocks.push({ kind: "richHeading", level, runs });
    } else if (tag === "p") {
      const runs = extractRuns(el);
      if (runs.length) blocks.push({ kind: "richParagraph", runs });
    } else if (tag === "ul" || tag === "ol") {
      const items = el.childNodes
        .filter((c) => c.nodeType === NodeType.ELEMENT_NODE && (c as HTMLElement).tagName?.toLowerCase() === "li")
        .map((li) => extractRuns(li))
        .filter((runs) => runs.length > 0);
      if (items.length) blocks.push({ kind: "richList", ordered: tag === "ol", items });
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
      if (rows.length) blocks.push({ kind: "richTable", rows });
    } else {
      // Any other block-level tag (div, blockquote, etc.) — treat its text
      // content as a plain paragraph rather than silently dropping it.
      const runs = extractRuns(el);
      if (runs.length) blocks.push({ kind: "richParagraph", runs });
    }
  }

  return [...blocks, { kind: "feeTable" }];
}

export const DEFAULT_OFFICE_LINE =
  "HMARK Consultants - Office Address: Suite 101, Dashtiyar Chambers, Opp. Urdu Federal University, Gulshan-e-Iqbal, Block 13-C, University Road, Karachi, Pakistan. Landline #: 021 34 999 777";
