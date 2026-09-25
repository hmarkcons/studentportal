// Turns a Word document into agreement-builder wording and a theme, keeping
// what makes it look the way it does: headings with their colours and rules,
// fonts, sizes and colours, alignment and spacing, bullets with their shape
// and colour, numbering, table shading and column widths, page breaks, and the
// page size and margins. Mammoth, which the builder used before, keeps only
// bold, italic, underline and headings.
//
// The document's prevailing look becomes the template's theme — its body
// font and size, how each heading level looks, its bullet, its table colours —
// and only what differs from that is kept on the text itself, so the result
// can still be restyled all at once from Page & theme, as in Word.
//
// A table that is the payment schedule (it mentions the "Total Professional
// Fee", as every HMARK contract's does) becomes the payment chart, which
// prints each student's own figures, and lends it its colours and wording. The
// signature lines at the end are left out: the PDF draws its own.
//
// Pure — the XML comes in as strings and a DOMParser is passed in — so the
// same code runs in the browser and under the unit tests
// (scripts/agreement-builder-test.mjs).

import { REFERENCE_THEME, fontChoice, normalizeColor, type BulletShape, type FeeRowLabel, type NumberFormat, type Theme } from "./pdf/agreementTheme.ts";

export type DocxParts = { document: string; styles?: string | null; numbering?: string | null; theme?: string | null };
export type DocxImport = { html: string; theme: Theme; notes: string[] };
type XmlParser = { parseFromString(xml: string, type: string): Document };

// ------------------------------------------------------------ XML helpers

type El = Element;
const kids = (el: El | null | undefined, name: string): El[] =>
  el ? (Array.from(el.childNodes).filter((n) => n.nodeType === 1 && (n as El).nodeName === name) as El[]) : [];
const kid = (el: El | null | undefined, name: string): El | null => kids(el, name)[0] ?? null;
const val = (el: El | null | undefined, name = "w:val"): string | null => (el ? el.getAttribute(name) : null);
const elements = (el: El): El[] => Array.from(el.childNodes).filter((n) => n.nodeType === 1) as El[];

/** A Word on/off property: present means on, unless its value says otherwise. */
function onOff(el: El | null): boolean | undefined {
  if (!el) return undefined;
  const v = val(el);
  return !(v === "0" || v === "false" || v === "off" || v === "none");
}

// ------------------------------------------------------------ formatting

type RunProps = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string | null; size?: number; font?: string | null; highlight?: string | null };
type ParaProps = {
  align?: string;
  before?: number;
  after?: number;
  line?: number;
  lineRule?: string;
  rule?: string | null;
  shade?: string | null;
  indLeft?: number;
  outline?: number;
  numId?: string;
  ilvl?: number;
  pageBreakBefore?: boolean;
  keepNext?: boolean;
};

const HIGHLIGHTS: Record<string, string> = {
  yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff", blue: "#0000ff", red: "#ff0000",
  darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000",
  darkYellow: "#808000", darkGray: "#808080", lightGray: "#c0c0c0", black: "#000000", white: "#ffffff",
};

function readRunProps(rPr: El | null, themeFonts: { minor: string | null; major: string | null }): RunProps {
  const p: RunProps = {};
  if (!rPr) return p;
  const b = onOff(kid(rPr, "w:b"));
  if (b !== undefined) p.bold = b;
  const i = onOff(kid(rPr, "w:i"));
  if (i !== undefined) p.italic = i;
  const u = kid(rPr, "w:u");
  if (u) p.underline = val(u) !== "none";
  const strike = onOff(kid(rPr, "w:strike")) ?? onOff(kid(rPr, "w:dstrike"));
  if (strike !== undefined) p.strike = strike;
  const color = kid(rPr, "w:color");
  if (color) p.color = normalizeColor(val(color)) ?? (val(color) === "auto" ? null : undefined);
  const sz = Number(val(kid(rPr, "w:sz")));
  if (Number.isFinite(sz) && sz > 0) p.size = sz / 2;
  const fonts = kid(rPr, "w:rFonts");
  if (fonts) {
    const named = val(fonts, "w:ascii") ?? val(fonts, "w:hAnsi");
    const themed = val(fonts, "w:asciiTheme") ?? val(fonts, "w:hAnsiTheme");
    const name = named ?? (themed ? (themed.startsWith("major") ? themeFonts.major : themeFonts.minor) : null);
    if (name) p.font = name;
  }
  const hl = val(kid(rPr, "w:highlight"));
  if (hl && hl !== "none") p.highlight = HIGHLIGHTS[hl] ?? null;
  const shd = normalizeColor(val(kid(rPr, "w:shd"), "w:fill"));
  if (shd && shd !== "#ffffff") p.highlight = shd;
  return p;
}

function readParaProps(pPr: El | null): ParaProps {
  const p: ParaProps = {};
  if (!pPr) return p;
  const jc = val(kid(pPr, "w:jc"));
  if (jc) p.align = jc;
  const spacing = kid(pPr, "w:spacing");
  if (spacing) {
    const before = Number(val(spacing, "w:before"));
    if (Number.isFinite(before) && val(spacing, "w:before") !== null) p.before = before / 20;
    const after = Number(val(spacing, "w:after"));
    if (Number.isFinite(after) && val(spacing, "w:after") !== null) p.after = after / 20;
    const line = Number(val(spacing, "w:line"));
    if (Number.isFinite(line) && line > 0) {
      p.line = line;
      p.lineRule = val(spacing, "w:lineRule") ?? "auto";
    }
  }
  const bottom = kid(kid(pPr, "w:pBdr"), "w:bottom");
  if (bottom) p.rule = val(bottom) === "none" || val(bottom) === "nil" ? null : normalizeColor(val(bottom, "w:color")) ?? "#000000";
  const shd = normalizeColor(val(kid(pPr, "w:shd"), "w:fill"));
  if (shd && shd !== "#ffffff") p.shade = shd;
  const ind = kid(pPr, "w:ind");
  if (ind) {
    const left = Number(val(ind, "w:left") ?? val(ind, "w:start"));
    if (Number.isFinite(left)) p.indLeft = left / 20;
  }
  const outline = Number(val(kid(pPr, "w:outlineLvl")));
  if (Number.isFinite(outline) && val(kid(pPr, "w:outlineLvl")) !== null) p.outline = outline;
  const numPr = kid(pPr, "w:numPr");
  if (numPr) {
    const numId = val(kid(numPr, "w:numId"));
    if (numId !== null) p.numId = numId;
    const ilvl = Number(val(kid(numPr, "w:ilvl")));
    if (Number.isFinite(ilvl)) p.ilvl = ilvl;
  }
  const pb = onOff(kid(pPr, "w:pageBreakBefore"));
  if (pb) p.pageBreakBefore = true;
  const keep = onOff(kid(pPr, "w:keepNext"));
  if (keep !== undefined) p.keepNext = keep;
  return p;
}

type Style = { type: string; name: string; basedOn: string | null; ppr: ParaProps; rpr: RunProps; isDefault: boolean };

function readStyles(xml: string | null | undefined, parser: XmlParser, themeFonts: { minor: string | null; major: string | null }) {
  const styles = new Map<string, Style>();
  let defaults: RunProps = {};
  let defaultPara: ParaProps = {};
  if (!xml) return { styles, defaults, defaultPara, defaultStyle: null as string | null };
  const root = parser.parseFromString(xml, "application/xml").documentElement;
  const docDefaults = kid(root, "w:docDefaults");
  defaults = readRunProps(kid(kid(docDefaults, "w:rPrDefault"), "w:rPr"), themeFonts);
  defaultPara = readParaProps(kid(kid(docDefaults, "w:pPrDefault"), "w:pPr"));
  let defaultStyle: string | null = null;
  for (const s of kids(root, "w:style")) {
    const id = s.getAttribute("w:styleId");
    if (!id) continue;
    const isDefault = s.getAttribute("w:default") === "1";
    const type = s.getAttribute("w:type") ?? "paragraph";
    if (isDefault && type === "paragraph") defaultStyle = id;
    styles.set(id, {
      type,
      name: (val(kid(s, "w:name")) ?? id).toLowerCase(),
      basedOn: val(kid(s, "w:basedOn")),
      ppr: readParaProps(kid(s, "w:pPr")),
      rpr: readRunProps(kid(s, "w:rPr"), themeFonts),
      isDefault,
    });
  }
  return { styles, defaults, defaultPara, defaultStyle };
}

/** A style's formatting with everything it is based on merged in underneath. */
function styleChain(styles: Map<string, Style>, id: string | null): { ppr: ParaProps; rpr: RunProps; heading: number | null } {
  const chain: Style[] = [];
  const seen = new Set<string>();
  let at = id;
  while (at && styles.has(at) && !seen.has(at)) {
    seen.add(at);
    const s = styles.get(at)!;
    chain.unshift(s);
    at = s.basedOn;
  }
  let heading: number | null = null;
  for (const s of chain) {
    const m = /^heading (\d)$/.exec(s.name);
    if (m) heading = Number(m[1]) - 1;
    else if (s.name === "title") heading = 0;
  }
  return {
    ppr: Object.assign({}, ...chain.map((s) => s.ppr)),
    rpr: Object.assign({}, ...chain.map((s) => s.rpr)),
    heading,
  };
}

// ------------------------------------------------------------ numbering

type Level = { ordered: boolean; bullet: BulletShape; numbering: NumberFormat; color: string | null };

const NUM_FMT: Record<string, NumberFormat> = {
  decimal: "decimal",
  lowerLetter: "lower-alpha",
  upperLetter: "upper-alpha",
  lowerRoman: "lower-roman",
  upperRoman: "upper-roman",
};

/** The bullet a Word list level draws, from its character and the font it draws it in. */
export function bulletShape(text: string, font: string | null): BulletShape {
  const t = text.trim();
  const f = (font ?? "").toLowerCase();
  const code = t.codePointAt(0) ?? 0;
  if (f.includes("wingdings")) {
    // Word's Wingdings bullets, by their private-use or ASCII code.
    const c = code >= 0xf000 ? code - 0xf000 : code;
    if (c === 0xa7 || c === 0x6e || c === 0xa8) return "square";
    if (c === 0xd8 || c === 0xe0 || c === 0xe8 || c === 0x46) return "arrow";
    if (c === 0xfc || c === 0xfe) return "check";
    if (c === 0x76 || c === 0x75) return "diamond";
    if (c === 0x6c || c === 0x9f) return "disc";
    return "square";
  }
  if (f.includes("symbol") && (code === 0xf0b7 || code === 0xb7)) return "disc";
  if (/^[▪■◼◾□▫]$/.test(t)) return "square";
  if (/^[◦○o]$/.test(t)) return "circle";
  if (/^[–—‒−-]$/.test(t)) return "dash";
  if (/^[➢➤►▶→⇒➔]$/.test(t)) return "arrow";
  if (/^[✓✔☑]$/.test(t)) return "check";
  if (/^[◆♦❖]$/.test(t)) return "diamond";
  return "disc";
}

function readNumbering(xml: string | null | undefined, parser: XmlParser) {
  const levels = new Map<string, Level>(); // `${numId}:${ilvl}`
  if (!xml) return levels;
  const root = parser.parseFromString(xml, "application/xml").documentElement;
  const abstract = new Map<string, El>();
  for (const a of kids(root, "w:abstractNum")) abstract.set(a.getAttribute("w:abstractNumId") ?? "", a);
  for (const num of kids(root, "w:num")) {
    const numId = num.getAttribute("w:numId") ?? "";
    const a = abstract.get(val(kid(num, "w:abstractNumId")) ?? "");
    if (!a) continue;
    for (const lvl of kids(a, "w:lvl")) {
      const ilvl = lvl.getAttribute("w:ilvl") ?? "0";
      const fmt = val(kid(lvl, "w:numFmt")) ?? "bullet";
      const text = val(kid(lvl, "w:lvlText")) ?? "•";
      const rPr = kid(lvl, "w:rPr");
      const fonts = kid(rPr, "w:rFonts");
      levels.set(`${numId}:${ilvl}`, {
        ordered: fmt !== "bullet" && fmt !== "none",
        bullet: bulletShape(text, fonts ? val(fonts, "w:ascii") ?? val(fonts, "w:hAnsi") : null),
        numbering: NUM_FMT[fmt] ?? "decimal",
        color: normalizeColor(val(kid(rPr, "w:color"))),
      });
    }
  }
  return levels;
}

// ------------------------------------------------------------ the document model

type Run = { text: string; props: RunProps; br?: boolean };
type Para = { kind: "p"; heading: number | null; list: (Level & { numId: string; ilvl: number }) | null; runs: Run[]; props: ParaProps; pageBreakAfter: boolean };
type Cell = { paras: Para[]; fill: string | null; span: number };
type Row = { cells: Cell[]; header: boolean };
type Table = { kind: "table"; rows: Row[]; border: string | null; grid: number[] };
type Block = Para | Table | { kind: "pageBreak" };

const text = (p: Para) => p.runs.map((r) => (r.br ? "\n" : r.text)).join("");

// ------------------------------------------------------------ output helpers

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

function mostCommon<T>(entries: [T, number][]): T | null {
  const tally = new Map<T, number>();
  for (const [k, w] of entries) tally.set(k, (tally.get(k) ?? 0) + w);
  let best: T | null = null;
  let bestW = -1;
  for (const [k, w] of tally) if (w > bestW) [best, bestW] = [k, w];
  return best;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------ the import

export function docxToTemplate(parts: DocxParts, parser: XmlParser, { feeTable = true }: { feeTable?: boolean } = {}): DocxImport {
  const notes: string[] = [];

  // The theme's fonts, for runs that name "the body font" rather than a font.
  const themeFonts = { minor: null as string | null, major: null as string | null };
  if (parts.theme) {
    const t = parser.parseFromString(parts.theme, "application/xml");
    const latin = (tag: string) => {
      const el = t.getElementsByTagName(tag)[0];
      const l = el ? (Array.from(el.getElementsByTagName("a:latin"))[0] as El | undefined) : undefined;
      return l?.getAttribute("typeface") || null;
    };
    themeFonts.minor = latin("a:minorFont");
    themeFonts.major = latin("a:majorFont");
  }

  const { styles, defaults, defaultPara, defaultStyle } = readStyles(parts.styles, parser, themeFonts);
  const levels = readNumbering(parts.numbering, parser);
  const doc = parser.parseFromString(parts.document, "application/xml").documentElement;
  const body = kid(doc, "w:body");
  if (!body) throw new Error("This file has no document body.");

  let pictures = 0;
  const unknownFonts = new Set<string>();

  function runsOf(container: El, paraRun: RunProps, out: Run[], state: { pageBreak: boolean }) {
    for (const node of elements(container)) {
      switch (node.nodeName) {
        case "w:r": {
          const rStyle = val(kid(kid(node, "w:rPr"), "w:rStyle"));
          const props: RunProps = { ...paraRun, ...(rStyle ? styleChain(styles, rStyle).rpr : {}), ...readRunProps(kid(node, "w:rPr"), themeFonts) };
          for (const part of elements(node)) {
            if (part.nodeName === "w:t") out.push({ text: part.textContent ?? "", props });
            else if (part.nodeName === "w:tab") out.push({ text: " ", props });
            else if (part.nodeName === "w:noBreakHyphen") out.push({ text: "-", props });
            else if (part.nodeName === "w:br" || part.nodeName === "w:cr") {
              if (val(part, "w:type") === "page") state.pageBreak = true;
              else out.push({ text: "", props, br: true });
            } else if (part.nodeName === "w:drawing" || part.nodeName === "w:pict") pictures++;
            else if (part.nodeName === "w:sym") {
              const ch = parseInt(val(part, "w:char") ?? "", 16);
              if (Number.isFinite(ch) && ch < 0xf000) out.push({ text: String.fromCodePoint(ch), props });
            }
          }
          break;
        }
        // Links, tracked insertions, content controls, simple fields and smart
        // tags carry ordinary runs inside; a tracked deletion is not text.
        case "w:hyperlink":
        case "w:ins":
        case "w:smartTag":
        case "w:fldSimple":
          runsOf(node, paraRun, out, state);
          break;
        case "w:sdt":
          runsOf(kid(node, "w:sdtContent") ?? node, paraRun, out, state);
          break;
        default:
          break;
      }
    }
  }

  function readPara(p: El): Para {
    const pPr = kid(p, "w:pPr");
    const styleId = val(kid(pPr, "w:pStyle")) ?? defaultStyle;
    const chain = styleChain(styles, styleId);
    const props: ParaProps = { ...defaultPara, ...chain.ppr, ...readParaProps(pPr) };
    // A paragraph mark's own run formatting (pPr/rPr) styles only the mark, not the text.
    const paraRun: RunProps = { ...defaults, ...chain.rpr };
    const state = { pageBreak: false };
    const runs: Run[] = [];
    runsOf(p, paraRun, runs, state);

    let heading: number | null = chain.heading;
    if (props.outline !== undefined && props.outline <= 8) heading = Math.min(props.outline, 2);
    if (heading !== null) heading = Math.min(heading, 2);

    let list: Para["list"] = null;
    if (heading === null && props.numId && props.numId !== "0") {
      const ilvl = props.ilvl ?? 0;
      const level = levels.get(`${props.numId}:${ilvl}`);
      if (level) list = { ...level, numId: props.numId, ilvl };
    }
    return { kind: "p", heading, list, runs, props, pageBreakAfter: state.pageBreak };
  }

  function readTable(tbl: El): Table {
    const tblPr = kid(tbl, "w:tblPr");
    const borders = kid(tblPr, "w:tblBorders");
    const edge = kid(borders, "w:insideH") ?? kid(borders, "w:top") ?? kid(borders, "w:left");
    const border = edge && val(edge) !== "none" && val(edge) !== "nil" ? normalizeColor(val(edge, "w:color")) : null;
    const grid = kids(kid(tbl, "w:tblGrid"), "w:gridCol").map((g) => Number(val(g, "w:w")) || 0);
    const rows: Row[] = [];
    for (const tr of kids(tbl, "w:tr")) {
      const header = !!kid(kid(tr, "w:trPr"), "w:tblHeader");
      const cells: Cell[] = kids(tr, "w:tc").map((tc) => {
        const tcPr = kid(tc, "w:tcPr");
        const fill = normalizeColor(val(kid(tcPr, "w:shd"), "w:fill"));
        const span = Math.max(1, Number(val(kid(tcPr, "w:gridSpan"))) || 1);
        return { paras: kids(tc, "w:p").map(readPara), fill: fill === "#ffffff" ? null : fill, span };
      });
      rows.push({ cells, header });
    }
    return { kind: "table", rows, border, grid };
  }

  const blocks: Block[] = [];
  const walk = (container: El) => {
    for (const node of elements(container)) {
      if (node.nodeName === "w:p") {
        const para = readPara(node);
        if (para.props.pageBreakBefore) blocks.push({ kind: "pageBreak" });
        blocks.push(para);
        if (para.pageBreakAfter) blocks.push({ kind: "pageBreak" });
      } else if (node.nodeName === "w:tbl") blocks.push(readTable(node));
      else if (node.nodeName === "w:sdt") walk(kid(node, "w:sdtContent") ?? node);
    }
  };
  walk(body);

  // Headings typed as bold paragraphs: short, bold throughout, kept with the
  // paragraph after, and not a list item — "What the Portal Provides" in the
  // reference contract. They become the level below the document's real
  // headings, so they can be restyled together from Page & theme, as the
  // numbered section titles can.
  const topLevel = blocks.some((b) => b.kind === "p" && b.heading === 0) ? 1 : 0;
  let pseudo = 0;
  for (const b of blocks) {
    if (b.kind !== "p" || b.heading !== null || b.list || !b.props.keepNext) continue;
    const t = text(b).trim();
    const words = b.runs.filter((r) => r.text.trim());
    if (t.length < 2 || t.length > 90 || /[.;]$/.test(t) || !words.length || !words.every((r) => r.props.bold)) continue;
    b.heading = topLevel;
    pseudo++;
  }

  // ---- the signature lines at the end: the PDF draws its own
  const isSignatureLine = (b: Block) => {
    if (b.kind !== "p") return false;
    const t = text(b).trim();
    return !t || /^[_\s.]+$/.test(t) || /\(signature\)|\[client name\]|\[consultant|\[employee|\[authori[sz]ed/i.test(t);
  };
  let dropped = 0;
  while (blocks.length && (isSignatureLine(blocks[blocks.length - 1]) || blocks[blocks.length - 1].kind === "pageBreak")) {
    const b = blocks.pop()!;
    if (b.kind === "p" && text(b).trim()) dropped++;
  }
  if (dropped) notes.push("Left out the signature lines at the end — the portal adds its own signature block, with the names filled in.");

  // ---- the payment table
  const isFee = (b: Block): b is Table =>
    feeTable && b.kind === "table" && b.rows.some((r) => r.cells.some((c) => c.paras.some((p) => /professional fee/i.test(text(p)))));
  const feeIndex = blocks.findIndex(isFee);

  // ---- the prevailing look → the theme
  const theme: Theme = structuredClone(REFERENCE_THEME);
  theme.base = "custom";
  const bodyParas = blocks.filter((b): b is Para => b.kind === "p" && b.heading === null && text(b).trim() !== "");
  const weight = (r: Run) => r.text.length;
  const fontOf = (name: string | null | undefined) => {
    const c = fontChoice(name);
    if (name && !c) unknownFonts.add(name);
    return c?.key ?? null;
  };

  const bodyRuns = bodyParas.flatMap((p) => p.runs.filter((r) => r.text.trim()));
  const bodyFont = mostCommon(bodyRuns.map((r) => [fontOf(r.props.font) ?? "", weight(r)] as [string, number]));
  if (bodyFont) theme.body.font = bodyFont;
  const bodySize = mostCommon(bodyRuns.map((r) => [r.props.size ?? 11, weight(r)] as [number, number]));
  if (bodySize) theme.body.size = Math.min(16, Math.max(6, bodySize));
  const bodyColor = mostCommon(bodyRuns.map((r) => [r.props.color ?? "#000000", weight(r)] as [string, number]));
  if (bodyColor) theme.body.color = bodyColor;
  const lineFactor = fontChoice(theme.body.font)?.line ?? 1.2;
  const plain = bodyParas.filter((p) => !p.list);
  const align = mostCommon(plain.map((p) => [p.props.align ?? "left", text(p).length] as [string, number]));
  theme.body.align = align === "both" || align === "distribute" ? "justify" : "left";
  const toLineHeight = (p: ParaProps) => (p.line && p.lineRule === "auto" ? round2((p.line / 240) * lineFactor) : null);
  const line = mostCommon(bodyParas.map((p) => [toLineHeight(p.props) ?? round2(lineFactor), text(p).length] as [number, number]));
  if (line) theme.body.lineHeight = Math.min(3, Math.max(0.9, line));
  const after = mostCommon(plain.map((p) => [p.props.after ?? 0, 1] as [number, number]));
  if (after !== null) theme.body.spaceAfter = Math.min(36, after);
  const listParas = bodyParas.filter((p) => p.list);
  const listAfter = mostCommon(listParas.map((p) => [p.props.after ?? 0, 1] as [number, number]));
  if (listAfter !== null) theme.list.spaceAfter = Math.min(36, listAfter);
  const bullets = listParas.filter((p) => !p.list!.ordered && p.list!.ilvl === 0);
  const bullet = mostCommon(bullets.map((p) => [p.list!.bullet, 1] as [BulletShape, number]));
  if (bullet) theme.list.bullet = bullet;
  const bulletColor = mostCommon(bullets.map((p) => [p.list!.color ?? theme.body.color, 1] as [string, number]));
  if (bulletColor) theme.list.color = bulletColor;
  const numbering = mostCommon(listParas.filter((p) => p.list!.ordered && p.list!.ilvl === 0).map((p) => [p.list!.numbering, 1] as [NumberFormat, number]));
  if (numbering) theme.list.numbering = numbering;

  const headingCounts = [0, 0, 0];
  for (let level = 0; level < 3; level++) {
    const hs = blocks.filter((b): b is Para => b.kind === "p" && b.heading === level && text(b).trim() !== "");
    headingCounts[level] = hs.length;
    const h = theme.headings[level];
    if (!hs.length) {
      // No heading of this level to copy: keep the reference's, in the document's font.
      h.font = theme.body.font;
      continue;
    }
    const runs = hs.flatMap((p) => p.runs.filter((r) => r.text.trim()));
    h.font = mostCommon(runs.map((r) => [fontOf(r.props.font) ?? theme.body.font, weight(r)] as [string, number])) ?? theme.body.font;
    h.size = Math.min(40, Math.max(6, mostCommon(runs.map((r) => [r.props.size ?? theme.body.size, weight(r)] as [number, number])) ?? h.size));
    h.color = mostCommon(runs.map((r) => [r.props.color ?? theme.body.color, weight(r)] as [string, number])) ?? h.color;
    h.bold = (mostCommon(runs.map((r) => [r.props.bold ? 1 : 0, weight(r)] as [number, number])) ?? 1) === 1;
    h.italic = (mostCommon(runs.map((r) => [r.props.italic ? 1 : 0, weight(r)] as [number, number])) ?? 0) === 1;
    h.rule = mostCommon(hs.map((p) => [p.props.rule ?? "", 1] as [string, number])) || null;
    h.spaceBefore = Math.min(48, mostCommon(hs.map((p) => [p.props.before ?? 0, 1] as [number, number])) ?? h.spaceBefore);
    h.spaceAfter = Math.min(48, mostCommon(hs.map((p) => [p.props.after ?? 0, 1] as [number, number])) ?? h.spaceAfter);
  }

  // The payment table lends the chart its colours and wording.
  if (feeIndex !== -1) {
    const fee = blocks[feeIndex] as Table;
    const rowText = (r: Row) => r.cells.map((c) => c.paras.map(text).join(" ").trim());
    const first = fee.rows[0];
    const firstTexts = first ? rowText(first) : [];
    const hasHeader = !!first && (first.header || (!!first.cells[0]?.fill && !firstTexts.some((t) => /\d/.test(t))));
    if (fee.border) theme.table.border = fee.border;
    if (hasHeader) {
      theme.fee.headerRow = true;
      theme.table.headerFill = first.cells[0]?.fill ?? null;
      const headColor = first.cells[0]?.paras[0]?.runs.find((r) => r.text.trim())?.props.color;
      if (headColor) theme.table.headerText = headColor;
      if (firstTexts[0]) theme.fee.paymentLabel = firstTexts[0].slice(0, 60);
      if (firstTexts[1]) theme.fee.amountLabel = firstTexts[1].slice(0, 60);
    } else {
      theme.fee.headerRow = false;
    }
    const dataRows = fee.rows.slice(hasHeader ? 1 : 0);
    const totalRow = dataRows.find((r) => rowText(r).some((t) => /professional fee|^total/i.test(t)));
    if (totalRow) {
      theme.table.totalFill = totalRow.cells[0]?.fill ?? null;
      theme.fee.total = rowText(totalRow)[0]?.slice(0, 120) || theme.fee.total;
    }
    const amounts = dataRows.flatMap((r) => rowText(r).slice(1)).filter((t) => /\d/.test(t));
    if (amounts.length) {
      theme.fee.amount = {
        symbol: amounts.every((t) => /^[^\d\s-]/.test(t.trim())) ? "before" : "after",
        decimals: amounts.some((t) => /\.\d{2}\b/.test(t)) ? "always" : "when-needed",
      };
    }
    const rows = dataRows.filter((r) => r !== totalRow).map((r) => rowText(r)[0] ?? "").filter(Boolean);
    const label = (l: string): FeeRowLabel => ({ label: l.slice(0, 200), note: "" });
    const adminAt = rows.findIndex((l) => /administrat/i.test(l));
    if (adminAt !== -1) theme.fee.admin = label(rows[adminAt]);
    const rest = rows.filter((_, i) => i !== adminAt);
    if (rest.length === 1) theme.fee.single = label(rest[0]);
    if (rest.length === 2) theme.fee.two = [label(rest[0]), label(rest[1])];
    if (rest.length === 3) theme.fee.three = [label(rest[0]), label(rest[1]), label(rest[2])];
    notes.push(
      "Turned the payment table into the payment chart, which fills in each student's own fee and installments — with the table's colours and wording."
    );
  } else {
    const firstTable = blocks.find((b): b is Table => b.kind === "table");
    if (firstTable) {
      if (firstTable.border) theme.table.border = firstTable.border;
      const head = firstTable.rows[0];
      if (head?.cells[0]?.fill) {
        theme.table.headerFill = head.cells[0].fill;
        const c = head.cells[0].paras[0]?.runs.find((r) => r.text.trim())?.props.color;
        if (c) theme.table.headerText = c;
      }
    }
  }

  // The page, from the document's last section.
  const sect = kid(body, "w:sectPr");
  if (sect) {
    const w = Number(val(kid(sect, "w:pgSz"), "w:w"));
    if (Number.isFinite(w) && w > 0) theme.page.size = Math.abs(w - 12240) < 240 ? "LETTER" : "A4";
    const left = Number(val(kid(sect, "w:pgMar"), "w:left"));
    if (Number.isFinite(left) && left > 0) theme.page.margin = Math.min(96, Math.max(24, round2(left / 20)));
  }

  // ---- the wording, keeping only what differs from the theme
  type Ctx = { font: string; size: number; color: string; bold: boolean; italic: boolean };
  const bodyCtx: Ctx = { font: theme.body.font, size: theme.body.size, color: theme.body.color, bold: false, italic: false };

  function runsHtml(runs: Run[], ctx: Ctx): string {
    let out = "";
    for (const r of runs) {
      if (r.br) {
        out += "<br>";
        continue;
      }
      if (!r.text) continue;
      let html = esc(r.text);
      const style: string[] = [];
      const font = fontOf(r.props.font);
      if (font && font !== ctx.font) style.push(`font-family: "${font}"`);
      if (r.props.size && Math.abs(r.props.size - ctx.size) > 0.01) style.push(`font-size: ${r.props.size}pt`);
      const color = r.props.color ?? "#000000";
      if (color !== ctx.color) style.push(`color: ${color}`);
      if (r.props.highlight) style.push(`background-color: ${r.props.highlight}`);
      if (style.length) html = `<span style="${escAttr(style.join("; "))}">${html}</span>`;
      if (r.props.strike) html = `<s>${html}</s>`;
      if (r.props.underline) html = `<u>${html}</u>`;
      if (r.props.italic && !ctx.italic) html = `<em>${html}</em>`;
      if (r.props.bold && !ctx.bold) html = `<strong>${html}</strong>`;
      out += html;
    }
    // Adjacent runs with the same formatting close and reopen the same tags.
    return out.replace(/<\/strong><strong>/g, "").replace(/<\/em><em>/g, "").replace(/<\/u><u>/g, "");
  }

  const alignCss = (a: string | undefined) => (a === "both" || a === "distribute" ? "justify" : a === "center" ? "center" : a === "right" || a === "end" ? "right" : a ? "left" : null);

  function paraAttrs(p: Para, defaults: { align: string; spaceBefore: number; spaceAfter: number | null; rule: string | null; lineHeight: number | null }): string {
    const attrs: string[] = [];
    const style: string[] = [];
    const align = alignCss(p.props.align) ?? "left";
    if (align !== defaults.align) style.push(`text-align: ${align}`);
    const lh = toLineHeight(p.props);
    if (defaults.lineHeight !== null && lh && Math.abs(lh - defaults.lineHeight) > 0.02) {
      attrs.push(`data-line-height="${lh}"`);
      style.push(`line-height: ${lh}`);
    }
    const before = p.props.before ?? 0;
    if (Math.abs(before - defaults.spaceBefore) > 0.01) {
      attrs.push(`data-space-before="${round2(before)}"`);
      style.push(`margin-top: ${round2(before)}pt`);
    }
    if (defaults.spaceAfter !== null) {
      const after = p.props.after ?? 0;
      if (Math.abs(after - defaults.spaceAfter) > 0.01) {
        attrs.push(`data-space-after="${round2(after)}"`);
        style.push(`margin-bottom: ${round2(after)}pt`);
      }
    }
    const rule = p.props.rule ?? null;
    if (rule && rule !== defaults.rule) {
      attrs.push(`data-rule="${rule}"`);
      style.push(`border-bottom: 1px solid ${rule}; padding-bottom: 2px`);
    }
    if (p.props.shade) {
      attrs.push(`data-shade="${p.props.shade}"`);
      style.push(`background-color: ${p.props.shade}; padding: 2px 5px`);
    }
    if (!p.heading && !p.list && p.props.indLeft && p.props.indLeft >= 12) {
      style.push(`margin-left: ${Math.min(8, Math.round(p.props.indLeft / 18)) * 24}px`);
    }
    if (style.length) attrs.push(`style="${escAttr(style.join("; "))}"`);
    return attrs.length ? " " + attrs.join(" ") : "";
  }

  const bodyDefaults = { align: theme.body.align, spaceBefore: 0, spaceAfter: theme.body.spaceAfter, rule: null, lineHeight: theme.body.lineHeight };

  function paraHtml(p: Para): string {
    if (p.heading !== null) {
      const h = theme.headings[p.heading];
      const ctx: Ctx = { font: h.font, size: h.size, color: h.color, bold: h.bold, italic: h.italic };
      const tag = `h${p.heading + 1}`;
      return `<${tag}${paraAttrs(p, { align: "left", spaceBefore: h.spaceBefore, spaceAfter: h.spaceAfter, rule: h.rule, lineHeight: null })}>${runsHtml(p.runs, ctx)}</${tag}>`;
    }
    return `<p${paraAttrs(p, bodyDefaults)}>${runsHtml(p.runs, bodyCtx)}</p>`;
  }

  function listItemHtml(p: Para): string {
    return `<p${paraAttrs(p, { ...bodyDefaults, spaceBefore: 0, spaceAfter: null, lineHeight: theme.body.lineHeight })}>${runsHtml(p.runs, bodyCtx)}</p>`;
  }

  function listOpen(l: NonNullable<Para["list"]>): string {
    const attrs: string[] = [];
    if (l.ordered) {
      if (l.numbering !== theme.list.numbering) attrs.push(`data-numbering="${l.numbering}"`, `style="list-style-type: ${l.numbering}"`);
    } else if (l.bullet !== theme.list.bullet) attrs.push(`data-bullet="${l.bullet}"`);
    if (l.color && l.color !== theme.list.color) attrs.push(`data-marker-color="${l.color}"`);
    return `<${l.ordered ? "ol" : "ul"}${attrs.length ? " " + attrs.join(" ") : ""}>`;
  }

  function tableHtml(t: Table): string {
    const colPx = t.grid.map((w) => Math.max(20, Math.round(w / 15)));
    const attrs = t.border && t.border !== theme.table.border ? ` data-border="${t.border}"` : "";
    let html = `<table${attrs}><tbody>`;
    t.rows.forEach((row, ri) => {
      const header = row.header || (ri === 0 && !!row.cells[0]?.fill && t.rows.length > 1);
      html += "<tr>";
      let col = 0;
      for (const cell of row.cells) {
        const tag = header ? "th" : "td";
        const widths = colPx.slice(col, col + cell.span);
        col += cell.span;
        const a: string[] = [];
        if (cell.span > 1) a.push(`colspan="${cell.span}"`);
        if (widths.length === cell.span && widths.every((w) => w > 0)) a.push(`colwidth="${widths.join(",")}"`);
        const headerFill = header ? theme.table.headerFill : null;
        if (cell.fill && cell.fill !== headerFill) a.push(`data-fill="${cell.fill}"`, `style="background-color: ${cell.fill}"`);
        const ctx: Ctx = header
          ? { ...bodyCtx, bold: true, color: theme.table.headerFill ? theme.table.headerText : theme.body.color }
          : bodyCtx;
        const paras = cell.paras.length ? cell.paras : [];
        const inner = paras
          .map((p) => {
            const align = alignCss(p.props.align);
            return `<p${align && align !== "left" ? ` style="text-align: ${align}"` : ""}>${runsHtml(p.runs, ctx)}</p>`;
          })
          .join("");
        html += `<${tag}${a.length ? " " + a.join(" ") : ""}>${inner || "<p></p>"}</${tag}>`;
      }
      html += "</tr>";
    });
    return html + "</tbody></table>";
  }

  let html = "";
  // Open lists, innermost last: each is the list element's closing tag and its level.
  const open: { close: string; ilvl: number; key: string }[] = [];
  const closeTo = (ilvl: number) => {
    while (open.length && open[open.length - 1].ilvl > ilvl) html += `</li>${open.pop()!.close}`;
  };
  const closeAll = () => closeTo(-1);

  blocks.forEach((b, i) => {
    if (b.kind === "p" && b.list) {
      if (!text(b).trim()) return;
      const l = b.list;
      const key = `${l.numId}:${l.ilvl}`;
      closeTo(l.ilvl);
      const top = open[open.length - 1];
      if (top && top.ilvl === l.ilvl && top.key !== key) {
        // A different list at the same level: close it and start another.
        html += `</li>${open.pop()!.close}`;
      }
      const same = open[open.length - 1];
      if (same && same.ilvl === l.ilvl) html += "</li><li>";
      else {
        html += listOpen(l) + "<li>";
        open.push({ close: l.ordered ? "</ol>" : "</ul>", ilvl: l.ilvl, key });
      }
      html += listItemHtml(b);
      return;
    }
    closeAll();
    if (b.kind === "pageBreak") html += `<div data-page-break="true"></div>`;
    else if (b.kind === "table") html += i === feeIndex ? "<p>{{fee_table}}</p>" : tableHtml(b);
    else if (text(b).trim()) html += paraHtml(b);
  });
  closeAll();

  // ---- what happened, in words
  const fontLabel = (k: string) => fontChoice(k)?.label ?? k;
  notes.unshift(
    `Page: ${theme.page.size === "LETTER" ? "US Letter" : "A4"}, ${round2(theme.page.margin / 72)} in side margins. Body text: ${fontLabel(theme.body.font)} ${theme.body.size} pt, ${theme.body.align === "justify" ? "justified" : "left-aligned"}.`
  );
  const counted = [
    headingCounts[0] + headingCounts[1] + headingCounts[2] && `${headingCounts[0] + headingCounts[1] + headingCounts[2]} headings`,
    listParas.length && `${listParas.length} list items`,
    blocks.filter((b) => b.kind === "table").length - (feeIndex !== -1 ? 1 : 0) > 0 &&
      `${blocks.filter((b) => b.kind === "table").length - (feeIndex !== -1 ? 1 : 0)} tables`,
  ].filter(Boolean);
  if (counted.length) notes.splice(1, 0, `Brought in ${counted.join(", ")}, with their colours and spacing.`);
  if (pseudo) notes.push(`Treated ${pseudo} short bold line${pseudo === 1 ? "" : "s"} kept with the next paragraph as Heading ${topLevel + 1}, so they can be restyled together.`);
  if (pictures) notes.push(`Left out ${pictures} picture${pictures === 1 ? "" : "s"} — the letterhead's logo is added to every page automatically.`);
  if (unknownFonts.size) notes.push(`No match here for ${[...unknownFonts].join(", ")}; that text prints in the body font.`);
  notes.push("The Word file's own header and footer are not used: the portal draws the letterhead, the date and the signature box on every page.");

  return { html, theme, notes };
}
