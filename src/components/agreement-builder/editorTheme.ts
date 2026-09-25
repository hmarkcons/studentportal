// The editor's page, drawn in the template's look: CSS custom properties the
// builder's stylesheet (globals.css, .agreement-paper) reads, worked out from
// the same Theme the PDF uses — or, with no theme, from the Classic look's
// fixed values in AgreementDocument. Only an approximation of the PDF in the
// details (the PDF is the "Preview PDF" button), but the fonts, sizes,
// colours, spacing and page width are the PDF's own, so lines break close to
// where they will print.

import { cssFontFamily, type HeadingStyle, type Theme } from "@/lib/pdf/agreementTheme";

const PT_TO_PX = 4 / 3;
const PAGE_WIDTH_PT = { A4: 595.28, LETTER: 612 } as const;

const CLASSIC_SERIF = `"Times New Roman", Times, serif`;
const CLASSIC_SANS = `Helvetica, Arial, sans-serif`;
const CLASSIC_INK = "#1b2420";

type Vars = Record<string, string>;

function heading(prefix: string, h: { font: string; size: number; color: string; bold: boolean; italic: boolean; rule: string | null; before: number; after: number }): Vars {
  return {
    [`--ag-${prefix}-font`]: h.font,
    [`--ag-${prefix}-size`]: `${h.size}pt`,
    [`--ag-${prefix}-color`]: h.color,
    [`--ag-${prefix}-weight`]: h.bold ? "700" : "400",
    [`--ag-${prefix}-style`]: h.italic ? "italic" : "normal",
    [`--ag-${prefix}-rule`]: h.rule ? `0.75pt solid ${h.rule}` : "none",
    [`--ag-${prefix}-pad`]: h.rule ? "1.5pt" : "0",
    [`--ag-${prefix}-before`]: `${h.before}pt`,
    [`--ag-${prefix}-after`]: `${h.after}pt`,
  };
}

const themed = (h: HeadingStyle) => ({
  font: cssFontFamily(h.font),
  size: h.size,
  color: h.color,
  bold: h.bold,
  italic: h.italic,
  rule: h.rule,
  before: h.spaceBefore,
  after: h.spaceAfter,
});

export type PaperLook = { vars: Vars; bullet: string; numbering: string; pageWidthPx: number; marginPx: number };

export function paperLook(theme: Theme | null | undefined): PaperLook {
  if (!theme) {
    const margin = 44;
    return {
      bullet: "classic",
      numbering: "decimal",
      pageWidthPx: Math.round(PAGE_WIDTH_PT.A4 * PT_TO_PX),
      marginPx: Math.round(margin * PT_TO_PX),
      vars: {
        "--ag-font": CLASSIC_SERIF,
        "--ag-size": "9pt",
        "--ag-color": CLASSIC_INK,
        "--ag-lh": "1.35",
        "--ag-align": "justify",
        "--ag-space": "4pt",
        "--ag-list-space": "3pt",
        "--ag-bullet-color": "currentColor",
        "--ag-table-border": CLASSIC_INK,
        "--ag-table-size": "8.5pt",
        "--ag-th-fill": "transparent",
        "--ag-th-color": CLASSIC_INK,
        "--ag-th-font": CLASSIC_SANS,
        ...heading("h1", { font: CLASSIC_SERIF, size: 12, color: CLASSIC_INK, bold: true, italic: false, rule: null, before: 8, after: 3 }),
        ...heading("h2", { font: CLASSIC_SERIF, size: 10.5, color: CLASSIC_INK, bold: true, italic: false, rule: null, before: 7, after: 3 }),
        ...heading("h3", { font: CLASSIC_SERIF, size: 9.5, color: CLASSIC_INK, bold: true, italic: false, rule: null, before: 6, after: 2 }),
      },
    };
  }
  return {
    bullet: theme.list.bullet,
    numbering: theme.list.numbering,
    pageWidthPx: Math.round(PAGE_WIDTH_PT[theme.page.size] * PT_TO_PX),
    marginPx: Math.round(theme.page.margin * PT_TO_PX),
    vars: {
      "--ag-font": cssFontFamily(theme.body.font),
      "--ag-size": `${theme.body.size}pt`,
      "--ag-color": theme.body.color,
      "--ag-lh": String(theme.body.lineHeight),
      "--ag-align": theme.body.align,
      "--ag-space": `${theme.body.spaceAfter}pt`,
      "--ag-list-space": `${theme.list.spaceAfter}pt`,
      "--ag-bullet-color": theme.list.color,
      "--ag-table-border": theme.table.border,
      "--ag-table-size": `${theme.body.size}pt`,
      "--ag-th-fill": theme.table.headerFill ?? "transparent",
      "--ag-th-color": theme.table.headerFill ? theme.table.headerText : theme.body.color,
      "--ag-th-font": cssFontFamily(theme.body.font),
      ...heading("h1", themed(theme.headings[0])),
      ...heading("h2", themed(theme.headings[1])),
      ...heading("h3", themed(theme.headings[2])),
    },
  };
}
