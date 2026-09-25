// The agreement builder's editor extensions: what each formatting tool stores
// in the wording, and how. Everything here writes HTML that
// src/lib/pdf/templateWording.ts reads back for the PDF — inline CSS for what
// the browser can show as it is (alignment, line spacing, margins) plus a
// data- attribute for anything the PDF needs to read exactly (a rule's colour,
// a list's bullet, a cell's fill). Change one side and the other must follow,
// or the editor and the PDF stop agreeing.

import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { BulletList, OrderedList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader } from "@tiptap/extension-table";
import { normalizeColor } from "@/lib/pdf/agreementTheme";

// Matches INDENT_STEP_PX in src/lib/pdf/templateWording.ts, which reads this
// same margin-left back out when converting wording to PDF blocks.
export const INDENT_STEP_PX = 24;
const MAX_INDENT = 8;

type BlockAttrs = {
  indent?: number;
  lineHeight?: number | null;
  spaceBefore?: number | null;
  spaceAfter?: number | null;
  rule?: string | null;
  shade?: string | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      /** Increase the current paragraph/heading's left margin one step. */
      indent: () => ReturnType;
      /** Decrease the current paragraph/heading's left margin one step. */
      outdent: () => ReturnType;
    };
    blockFormat: {
      /** Set one of the paragraph options (line spacing, spacing, rule, shade) on every paragraph and heading in the selection; null clears it. */
      setBlockFormat: (name: keyof BlockAttrs, value: number | string | null) => ReturnType;
    };
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
  }
}

const BLOCK_TYPES = ["paragraph", "heading"];

const num = (v: string | null) => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Word-style paragraph options for a paragraph or heading: indent (distinct
 * from list nesting, which moves a list item into a sub-list), line spacing,
 * space above and below, a rule underneath and a background shade. Each is
 * written as the CSS the editor shows and, where the PDF needs the exact
 * value, a data- attribute it reads.
 */
export const BlockFormat = Extension.create({
  name: "blockFormat",
  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element: HTMLElement) => {
              const level = Math.round(parseInt(element.style.marginLeft || "0", 10) / INDENT_STEP_PX);
              return Number.isFinite(level) && level > 0 ? level : 0;
            },
            renderHTML: (attributes: BlockAttrs) =>
              attributes.indent ? { style: `margin-left: ${attributes.indent * INDENT_STEP_PX}px` } : {},
          },
          lineHeight: {
            default: null,
            parseHTML: (element: HTMLElement) => num(element.getAttribute("data-line-height")),
            renderHTML: (attributes: BlockAttrs) =>
              attributes.lineHeight ? { "data-line-height": String(attributes.lineHeight), style: `line-height: ${attributes.lineHeight}` } : {},
          },
          spaceBefore: {
            default: null,
            parseHTML: (element: HTMLElement) => num(element.getAttribute("data-space-before")),
            renderHTML: (attributes: BlockAttrs) =>
              attributes.spaceBefore !== null && attributes.spaceBefore !== undefined
                ? { "data-space-before": String(attributes.spaceBefore), style: `margin-top: ${attributes.spaceBefore}pt` }
                : {},
          },
          spaceAfter: {
            default: null,
            parseHTML: (element: HTMLElement) => num(element.getAttribute("data-space-after")),
            renderHTML: (attributes: BlockAttrs) =>
              attributes.spaceAfter !== null && attributes.spaceAfter !== undefined
                ? { "data-space-after": String(attributes.spaceAfter), style: `margin-bottom: ${attributes.spaceAfter}pt` }
                : {},
          },
          rule: {
            default: null,
            parseHTML: (element: HTMLElement) => normalizeColor(element.getAttribute("data-rule")),
            renderHTML: (attributes: BlockAttrs) =>
              attributes.rule ? { "data-rule": attributes.rule, style: `border-bottom: 1px solid ${attributes.rule}; padding-bottom: 2px` } : {},
          },
          shade: {
            default: null,
            parseHTML: (element: HTMLElement) => normalizeColor(element.getAttribute("data-shade")),
            renderHTML: (attributes: BlockAttrs) =>
              attributes.shade ? { "data-shade": attributes.shade, style: `background-color: ${attributes.shade}; padding: 2px 5px` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    const step =
      (delta: number) =>
      () =>
      ({ editor, chain }: { editor: import("@tiptap/core").Editor; chain: () => import("@tiptap/core").ChainedCommands }) => {
        const type = BLOCK_TYPES.find((t) => editor.isActive(t));
        if (!type) return false;
        const current = Number(editor.getAttributes(type).indent ?? 0);
        const next = current + delta;
        if (next < 0 || next > MAX_INDENT) return false;
        return chain().updateAttributes(type, { indent: next }).run();
      };
    return {
      indent: step(1),
      outdent: step(-1),
      setBlockFormat:
        (name, value) =>
        ({ chain }) =>
          chain().updateAttributes("paragraph", { [name]: value }).updateAttributes("heading", { [name]: value }).run(),
    };
  },
  addKeyboardShortcuts() {
    return {
      // Inside a list, Tab/Shift-Tab nests the item into/out of a sub-list
      // (same as MS Word); otherwise they shift the whole paragraph's margin.
      Tab: () => (this.editor.isActive("listItem") ? this.editor.commands.sinkListItem("listItem") : this.editor.commands.indent()),
      "Shift-Tab": () => (this.editor.isActive("listItem") ? this.editor.commands.liftListItem("listItem") : this.editor.commands.outdent()),
    };
  },
});

// A list's bullet shape or colour, chosen in the toolbar. Absent means the
// template's default (Page & theme → Bullets). The colour is also set as a
// CSS variable so the editor's ::marker shows it.
const markerColor = {
  markerColor: {
    default: null,
    parseHTML: (element: HTMLElement) => normalizeColor(element.getAttribute("data-marker-color")),
    renderHTML: (attributes: { markerColor?: string | null }) =>
      attributes.markerColor ? { "data-marker-color": attributes.markerColor, style: `--ag-marker: ${attributes.markerColor}` } : {},
  },
};

export const StyledBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      bullet: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-bullet"),
        renderHTML: (attributes: { bullet?: string | null }) => (attributes.bullet ? { "data-bullet": attributes.bullet } : {}),
      },
      ...markerColor,
    };
  },
});

const OL_TYPE_NUMBERING: Record<string, string> = { "1": "decimal", a: "lower-alpha", A: "upper-alpha", i: "lower-roman", I: "upper-roman" };

// A numbered list's style (1. a. A. i. I.). Its own attribute rather than the
// list's HTML `type`, which TipTap never writes for "1" — so plain numbers
// could not be chosen over a template whose default is letters. A pasted
// list's `type` is read in as the same thing.
export const StyledOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      numbering: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-numbering") ?? OL_TYPE_NUMBERING[element.getAttribute("type") ?? ""] ?? null,
        renderHTML: (attributes: { numbering?: string | null }) =>
          attributes.numbering ? { "data-numbering": attributes.numbering, style: `list-style-type: ${attributes.numbering}` } : {},
      },
      ...markerColor,
    };
  },
});

// A cell's background, and a table's line colour.
const fill = {
  fill: {
    default: null,
    parseHTML: (element: HTMLElement) => normalizeColor(element.getAttribute("data-fill") ?? element.style.backgroundColor),
    renderHTML: (attributes: { fill?: string | null }) =>
      attributes.fill ? { "data-fill": attributes.fill, style: `background-color: ${attributes.fill}` } : {},
  },
};

export const StyledTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...fill };
  },
});

export const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...fill };
  },
});

export const StyledTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      border: {
        default: null,
        parseHTML: (element: HTMLElement) => normalizeColor(element.getAttribute("data-border")),
        renderHTML: (attributes: { border?: string | null }) =>
          attributes.border ? { "data-border": attributes.border, style: `--ag-table-border: ${attributes.border}` } : {},
      },
    };
  },
});

/** A forced page break: the PDF starts a new page here. */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-page-break": "true", class: "ag-page-break" })];
  },
  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name }, { type: "paragraph" }]).run(),
    };
  },
});
