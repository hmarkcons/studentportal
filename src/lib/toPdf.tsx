// Turns a stored file into a PDF, in the browser (src/lib/pdfConversion.ts
// says why there). Loaded only when someone downloads a file, and each kind
// loads only what it needs: a PDF passes through; a photo becomes an A4 page
// (pdf-lib, as joining photos does); an iPhone HEIC photo is decoded first;
// a Word file is read with mammoth and laid out again with its headings,
// lists, tables and pictures; a spreadsheet becomes its sheets' tables; a
// text file becomes its text. The layout of a Word or Excel file is close to
// the original, not identical — the price of nothing leaving the portal.
import type { ReactElement } from "react";
import { conversionKind, pdfName } from "./pdfConversion.ts";
import { decodeCsvBytes, parseCsv } from "./csv.ts";
import { combineIntoPdf } from "./combinePdf.ts";

export type PdfOutcome = { ok: true; blob: Blob; name: string } | { ok: false; why?: string };

/** What a converted document is made of, whatever it came from. */
type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; link?: string; script?: "sup" | "sub" };
type Block =
  | { t: "heading"; level: number; runs: Run[] }
  | { t: "para"; runs: Run[] }
  | { t: "list"; ordered: boolean; items: Block[][] }
  | { t: "table"; rows: { header: boolean; cells: { span: number; blocks: Block[] }[] }[] }
  | { t: "image"; src: string }
  | { t: "missing-image" }
  | { t: "pre"; text: string };
type Sheet = { title: string; rows: string[][]; note?: string };

/** Big enough never to be the reason a download fails; joining photos for an upload uses the 5 MB limit. */
const NO_LIMIT = 1024 * 1024 * 1024;
const SHEET_ROW_CAP = 3000;
const COLUMNS_PER_TABLE = 14;

export async function convertToPdf(source: Blob, name: string): Promise<PdfOutcome> {
  const kind = conversionKind(name, source.type);
  const out = pdfName(name);
  try {
    switch (kind) {
      case "pdf":
        return { ok: true, blob: source.type === "application/pdf" ? source : new Blob([source], { type: "application/pdf" }), name: out };
      case "image":
        return await pictureToPdf(source, name);
      case "heic": {
        const heic2any = (await import("heic2any")).default;
        const jpeg = await heic2any({ blob: source, toType: "image/jpeg", quality: 0.9 });
        return await pictureToPdf(Array.isArray(jpeg) ? jpeg[0] : jpeg, name.replace(/\.(heic|heif)$/i, ".jpg"));
      }
      case "text": {
        const text = decodeCsvBytes(await source.arrayBuffer());
        const html = /\.html?$/i.test(name) || source.type === "text/html";
        return await render(html ? htmlToBlocks(text) : textBlocks(text), [], name, out);
      }
      case "csv": {
        const text = decodeCsvBytes(await source.arrayBuffer());
        const rows = /\.tsv$/i.test(name) || source.type === "text/tab-separated-values" ? text.split(/\r?\n/).map((l) => l.split("\t")) : parseCsv(text);
        return await render([], [sheetOf(name, rows)], name, out);
      }
      case "docx": {
        const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
        const result = await mammoth.convertToHtml(
          { arrayBuffer: await source.arrayBuffer() },
          { styleMap: ["u => u", "strike => s"] }
        );
        return await render(htmlToBlocks(result.value), [], name, out);
      }
      case "xlsx": {
        const readXlsxFile = (await import("read-excel-file/browser")).default;
        const sheets = await readXlsxFile(source);
        return await render([], sheets.map((s) => sheetOf(s.sheet, (s.data as unknown[][]).map((row) => row.map(cellText)))), name, out);
      }
      default:
        return { ok: false };
    }
  } catch (e) {
    return { ok: false, why: plainReason(e) };
  }
}

function plainReason(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e ?? "");
  if (/corrupt|zip|end of central directory|invalid/i.test(message)) return "the file looks damaged";
  if (/password|encrypt/i.test(message)) return "the file is password-protected";
  return "this browser could not read it";
}

// ---------------------------------------------------------------- photos

async function pictureToPdf(picture: Blob, name: string): Promise<PdfOutcome> {
  const asFile = (b: Blob, n: string) => new File([b], n, { type: b.type || "image/jpeg" });
  const first = await combineIntoPdf([asFile(picture, name)], { limitBytes: NO_LIMIT });
  if (first.ok) return { ok: true, blob: first.file, name: pdfName(name) };
  // An SVG, or anything else createImageBitmap will not open: drawn by the
  // page's own image decoder instead, then made a page like any photo.
  const png = await rasterise(picture);
  if (!png) return { ok: false, why: "it could not be opened as a picture" };
  const second = await combineIntoPdf([asFile(png, `${name}.png`)], { limitBytes: NO_LIMIT });
  return second.ok ? { ok: true, blob: second.file, name: pdfName(name) } : { ok: false, why: "it could not be opened as a picture" };
}

async function rasterise(picture: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(picture);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const width = img.naturalWidth || 1600;
    const height = img.naturalHeight || 1200;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------- text, HTML and Word

function textBlocks(text: string): Block[] {
  // In pieces, so a long file breaks across pages without one enormous run.
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i += 120) blocks.push({ t: "pre", text: lines.slice(i, i + 120).join("\n") });
  return blocks.length ? blocks : [{ t: "pre", text: "" }];
}

/** Mammoth's HTML (or an HTML file's), as blocks: the elements a document is made of. */
function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return blocksOf(doc.body);
}

const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "div", "section", "article", "blockquote", "pre", "img", "header", "footer", "main"]);

function blocksOf(parent: Element): Block[] {
  const blocks: Block[] = [];
  let pending: Run[] = [];
  const flush = () => {
    if (pending.some((r) => r.text.trim())) blocks.push({ t: "para", runs: pending });
    pending = [];
  };
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      pending.push(...runsOf(node, {}, []));
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "head") continue;
    if (!BLOCK_TAGS.has(tag)) {
      const images: Block[] = [];
      pending.push(...runsOf(el, {}, images));
      if (images.length) {
        flush();
        blocks.push(...images);
      }
      continue;
    }
    flush();
    if (/^h[1-6]$/.test(tag)) {
      blocks.push({ t: "heading", level: Number(tag[1]), runs: runsOf(el, {}, []) });
    } else if (tag === "p") {
      const images: Block[] = [];
      const runs = runsOf(el, {}, images);
      // An empty paragraph is the blank line Word users type between paragraphs.
      blocks.push({ t: "para", runs: runs.length ? runs : [{ text: " " }] });
      blocks.push(...images);
    } else if (tag === "ul" || tag === "ol") {
      blocks.push({ t: "list", ordered: tag === "ol", items: Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "li").map((li) => blocksOf(li)) });
    } else if (tag === "table") {
      blocks.push(tableOf(el));
    } else if (tag === "img") {
      blocks.push(imageOf(el));
    } else if (tag === "pre") {
      blocks.push({ t: "pre", text: el.textContent ?? "" });
    } else {
      blocks.push(...blocksOf(el));
    }
  }
  flush();
  return blocks;
}

function runsOf(node: Node, style: Omit<Run, "text">, images: Block[]): Run[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ");
    return text ? [{ ...style, text }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return [{ ...style, text: "\n" }];
  if (tag === "img") {
    images.push(imageOf(el));
    return [];
  }
  const next = { ...style };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
  if (tag === "sup") next.script = "sup";
  if (tag === "sub") next.script = "sub";
  if (tag === "a") {
    const href = el.getAttribute("href") ?? "";
    if (/^https?:|^mailto:/i.test(href)) next.link = href;
  }
  return Array.from(el.childNodes).flatMap((c) => runsOf(c, next, images));
}

function imageOf(el: Element): Block {
  const src = el.getAttribute("src") ?? "";
  // react-pdf draws PNG and JPEG; Word's other pictures (EMF, WMF, GIF) are said to be missing.
  return /^data:image\/(png|jpe?g);base64,/i.test(src) ? { t: "image", src } : { t: "missing-image" };
}

function tableOf(table: Element): Block {
  const rows: { header: boolean; cells: { span: number; blocks: Block[] }[] }[] = [];
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    // Only this table's rows, not those of a table inside one of its cells.
    if (tr.closest("table") !== table) continue;
    const cells = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName));
    rows.push({
      header: cells.length > 0 && cells.every((c) => c.tagName.toLowerCase() === "th"),
      cells: cells.map((c) => ({ span: Math.max(1, Number(c.getAttribute("colspan")) || 1), blocks: blocksOf(c) })),
    });
  }
  return { t: "table", rows };
}

// ---------------------------------------------------------------- spreadsheets

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

function sheetOf(title: string, raw: string[][]): Sheet {
  let rows = raw.map((r) => r.map((c) => (c ?? "").toString()));
  rows = rows.filter((r) => r.some((c) => c.trim()));
  const width = Math.max(0, ...rows.map((r) => {
    let last = r.length - 1;
    while (last >= 0 && !r[last].trim()) last--;
    return last + 1;
  }));
  rows = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  const total = rows.length;
  const note = total > SHEET_ROW_CAP ? `The first ${SHEET_ROW_CAP.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} rows — open the original for the rest.` : undefined;
  return { title, rows: rows.slice(0, SHEET_ROW_CAP), note };
}

const columnLetter = (i: number): string => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// ---------------------------------------------------------------- the PDF

let fontsReady = false;

async function render(blocks: Block[], sheets: Sheet[], name: string, out: string): Promise<PdfOutcome> {
  const rp = await import("@react-pdf/renderer");
  // Link renamed: the portal's lint rule for next/link reads any <Link>.
  const { Document, Page, Text, View, Image, Link: PdfLink, Font, StyleSheet, pdf } = rp;
  if (!fontsReady) {
    // The agreement builder's Carlito (Calibri's measure), served with the portal.
    const at = (w: number, s: "normal" | "italic") => `/fonts/agreement/carlito-${w}-${s}.ttf`;
    Font.register({
      family: "Carlito",
      fonts: [
        { src: at(400, "normal") },
        { src: at(700, "normal"), fontWeight: 700 },
        { src: at(400, "italic"), fontStyle: "italic" },
        { src: at(700, "italic"), fontWeight: 700, fontStyle: "italic" },
      ],
    });
    Font.registerHyphenationCallback((word) => [word]);
    fontsReady = true;
  }

  const s = StyleSheet.create({
    page: { fontFamily: "Carlito", fontSize: 11, paddingTop: 42, paddingBottom: 48, paddingHorizontal: 46, color: "#111111" },
    para: { marginBottom: 6, lineHeight: 1.35 },
    pre: { fontSize: 9.5, lineHeight: 1.3 },
    listRow: { flexDirection: "row", marginBottom: 3 },
    bullet: { width: 16 },
    grow: { flex: 1 },
    table: { borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: "#999999", marginVertical: 6 },
    row: { flexDirection: "row" },
    cell: { borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: "#999999", padding: 3 },
    image: { marginVertical: 6, maxHeight: 640, objectFit: "contain" },
    missing: { fontSize: 9, fontStyle: "italic", color: "#777777", marginVertical: 4 },
    footer: { position: "absolute", bottom: 20, left: 46, right: 46, fontSize: 8, color: "#888888", textAlign: "center" },
    sheetTitle: { fontSize: 13, fontWeight: 700, marginBottom: 6 },
    sheetNote: { fontSize: 8.5, color: "#777777", marginBottom: 4 },
  });

  const runs = (list: Run[], key: string, base: number) =>
    list.map((r, i) => {
      const style = {
        fontWeight: r.bold ? 700 : 400,
        fontStyle: r.italic ? ("italic" as const) : ("normal" as const),
        textDecoration: r.underline ? ("underline" as const) : r.strike ? ("line-through" as const) : ("none" as const),
        fontSize: r.script ? base * 0.7 : base,
      };
      return r.link ? (
        <PdfLink key={`${key}-${i}`} src={r.link} style={{ ...style, color: "#1a56db" }}>
          {r.text}
        </PdfLink>
      ) : (
        <Text key={`${key}-${i}`} style={style}>
          {r.text}
        </Text>
      );
    });

  const HEADING = [0, 20, 16, 14, 12.5, 12, 11];
  const draw = (list: Block[], key: string, base = 11): ReactElement[] =>
    list.map((b, i) => {
      const k = `${key}.${i}`;
      switch (b.t) {
        case "heading":
          return (
            <Text key={k} style={{ fontSize: HEADING[b.level] ?? 11, fontWeight: 700, marginTop: 8, marginBottom: 5 }} minPresenceAhead={30}>
              {runs(b.runs, k, HEADING[b.level] ?? 11)}
            </Text>
          );
        case "para":
          return (
            <Text key={k} style={{ ...s.para, fontSize: base }}>
              {runs(b.runs, k, base)}
            </Text>
          );
        case "pre":
          return (
            <Text key={k} style={s.pre}>
              {b.text}
            </Text>
          );
        case "list":
          return (
            <View key={k} style={{ marginBottom: 4 }}>
              {b.items.map((item, j) => (
                <View key={`${k}-${j}`} style={s.listRow} wrap={false}>
                  <Text style={{ ...s.bullet, fontSize: base }}>{b.ordered ? `${j + 1}.` : "•"}</Text>
                  <View style={s.grow}>{draw(item, `${k}-${j}`, base)}</View>
                </View>
              ))}
            </View>
          );
        case "table": {
          const columns = Math.max(1, ...b.rows.map((r) => r.cells.reduce((n, c) => n + c.span, 0)));
          const size = columns > 8 ? 7 : columns > 5 ? 8.5 : 9.5;
          return (
            <View key={k} style={s.table}>
              {b.rows.map((r, j) => (
                <View key={`${k}-${j}`} style={s.row} wrap={false}>
                  {r.cells.map((c, m) => (
                    <View key={`${k}-${j}-${m}`} style={{ ...s.cell, flex: c.span, backgroundColor: r.header ? "#f1f1f1" : undefined }}>
                      {draw(c.blocks.length ? c.blocks : [{ t: "para", runs: [{ text: " " }] }], `${k}-${j}-${m}`, size)}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        }
        case "image":
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image, which has no alt.
          return <Image key={k} src={b.src} style={s.image} />;
        case "missing-image":
          return (
            <Text key={k} style={s.missing}>
              [A picture in the original that could not be shown here]
            </Text>
          );
      }
    });

  const footer = (
    <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${name} · page ${pageNumber} of ${totalPages}`} />
  );

  const sheetPages = sheets.flatMap((sheet, i) => {
    const width = sheet.rows[0]?.length ?? 0;
    const chunks: number[] = [];
    for (let c = 0; c < Math.max(1, width); c += COLUMNS_PER_TABLE) chunks.push(c);
    return chunks.map((from) => {
      const to = Math.min(width, from + COLUMNS_PER_TABLE);
      const cols = Math.max(1, to - from);
      const size = cols > 10 ? 6.5 : cols > 6 ? 7.5 : 9;
      return (
        <Page key={`sheet-${i}-${from}`} size="A4" orientation="landscape" style={{ ...s.page, paddingHorizontal: 30 }}>
          <Text style={s.sheetTitle}>
            {sheet.title}
            {width > COLUMNS_PER_TABLE ? `  ·  columns ${columnLetter(from)}–${columnLetter(to - 1)}` : ""}
          </Text>
          {sheet.note && <Text style={s.sheetNote}>{sheet.note}</Text>}
          {sheet.rows.length === 0 ? (
            <Text style={s.missing}>This sheet is empty.</Text>
          ) : (
            <View style={s.table}>
              {sheet.rows.map((r, j) => (
                <View key={j} style={s.row} wrap={false}>
                  {r.slice(from, to).map((c, m) => (
                    <View key={m} style={{ ...s.cell, flex: 1, backgroundColor: j === 0 ? "#f1f1f1" : undefined }}>
                      <Text style={{ fontSize: size, fontWeight: j === 0 ? 700 : 400 }}>{c}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
          {footer}
        </Page>
      );
    });
  });

  const doc = (
    <Document title={name}>
      {blocks.length > 0 && (
        <Page size="A4" style={s.page}>
          {draw(blocks, "b")}
          {footer}
        </Page>
      )}
      {sheetPages}
    </Document>
  );
  const blob = await pdf(doc).toBlob();
  return { ok: true, blob, name: out };
}
