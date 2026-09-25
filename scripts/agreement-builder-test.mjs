// The agreement builder's pure parts: the theme a template stores, the
// wording parser that reads the builder's formatting back for the PDF, the
// payment chart's rows, and the Word import.
//
// What these guard against is quiet: a formatting tool the parser does not
// read prints nothing different and raises nothing; a theme value that is not
// checked can put an unknown font or a 400pt heading into a contract; and a
// Word import that brings the payment table across as a table prints sample
// figures on every student's agreement.
import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import {
  REFERENCE_THEME,
  normalizeTheme,
  normalizeColor,
  fontChoice,
  formatAmount,
  formatListNumber,
  themedFeeRows,
} from "../src/lib/pdf/agreementTheme.ts";
import { wordingToBlocks } from "../src/lib/pdf/templateWording.ts";
import { docxToTemplate, bulletShape } from "../src/lib/docxImport.ts";

// ------------------------------------------------------------ the theme

test("no design, or anything that is not one, is the Classic look", () => {
  for (const v of [null, undefined, "", "null", "not json", 42, [], "[1]"]) assert.equal(normalizeTheme(v), null, String(v));
});

test("a partial design is completed from the reference style", () => {
  const t = normalizeTheme({ body: { size: 11 } });
  assert.equal(t.body.size, 11);
  assert.equal(t.body.font, REFERENCE_THEME.body.font);
  assert.deepEqual(t.fee.two, REFERENCE_THEME.fee.two);
  assert.equal(t.headings.length, 3);
});

test("a stored design is read back from its JSON as the form sends it", () => {
  const t = normalizeTheme(JSON.stringify({ ...REFERENCE_THEME, page: { size: "A4", margin: 54 } }));
  assert.equal(t.page.size, "A4");
  assert.equal(t.page.margin, 54);
});

test("values outside what a contract can take are refused or held to the limits", () => {
  const t = normalizeTheme({
    body: { font: "Comic Sans MS", size: 400, color: "red; background: url(x)", align: "center" },
    headings: [{ size: -3, color: "#12G456", rule: "#abc" }],
    page: { size: "A3", margin: 1 },
    list: { bullet: "skull" },
  });
  assert.equal(t.body.font, "Carlito");
  assert.equal(t.body.size, 16);
  assert.equal(t.body.color, REFERENCE_THEME.body.color);
  assert.equal(t.body.align, REFERENCE_THEME.body.align);
  assert.equal(t.headings[0].size, 6);
  assert.equal(t.headings[0].color, REFERENCE_THEME.headings[0].color);
  assert.equal(t.headings[0].rule, "#aabbcc");
  assert.equal(t.page.size, "LETTER");
  assert.equal(t.page.margin, 24);
  assert.equal(t.list.bullet, "square");
});

test("a colour switched off stays off, and a blank label keeps its row readable", () => {
  const t = normalizeTheme({ table: { headerFill: null, totalFill: "" }, fee: { admin: { label: "", note: "x" }, total: "" } });
  assert.equal(t.table.headerFill, null);
  assert.equal(t.table.totalFill, null);
  assert.equal(t.fee.admin.label, REFERENCE_THEME.fee.admin.label);
  assert.equal(t.fee.admin.note, "x");
  assert.equal(t.fee.total, REFERENCE_THEME.fee.total);
});

test("colours are read however the browser or Word writes them", () => {
  assert.equal(normalizeColor("#52BE96"), "#52be96");
  assert.equal(normalizeColor("52BE96"), "#52be96");
  assert.equal(normalizeColor("rgb(82, 190, 150)"), "#52be96");
  assert.equal(normalizeColor("rgba(82 190 150 / 0.5)"), "#52be96");
  assert.equal(normalizeColor("rgba(0, 0, 0, 0)"), null);
  assert.equal(normalizeColor("#abc"), "#aabbcc");
  assert.equal(normalizeColor("auto"), null);
  assert.equal(normalizeColor("javascript:alert(1)"), null);
});

test("a font is found by its own name, a CSS list, or the Word font it stands in for", () => {
  assert.equal(fontChoice("Carlito").key, "Carlito");
  assert.equal(fontChoice('"Open Sans", sans-serif').key, "Open Sans");
  assert.equal(fontChoice("Calibri").key, "Carlito");
  assert.equal(fontChoice("Times New Roman").key, "Tinos");
  assert.equal(fontChoice("Wingdings"), null);
});

test("amounts print as the template says, and never lose cents that are there", () => {
  assert.equal(formatAmount("€", 2100), "€2,100.00");
  assert.equal(formatAmount("€", 2100, { symbol: "after", decimals: "when-needed" }), "2,100 €");
  assert.equal(formatAmount("€", 533.33, { symbol: "after", decimals: "when-needed" }), "533.33 €");
  assert.equal(formatAmount("$", 900, { symbol: "before", decimals: "when-needed" }), "$900");
});

test("list numbers in each numbering style", () => {
  assert.equal(formatListNumber(3, "decimal"), "3.");
  assert.equal(formatListNumber(3, "lower-alpha"), "c.");
  assert.equal(formatListNumber(28, "upper-alpha"), "AB.");
  assert.equal(formatListNumber(4, "lower-roman"), "iv.");
  assert.equal(formatListNumber(9, "upper-roman"), "IX.");
});

// ------------------------------------------------------------ the payment chart

const fee = (over) => ({ currencySymbol: "€", adminCharge: 300, consultancyFee: 1800, installmentAmounts: [900, 900], discount: 0, total: 2100, isBackup: false, destinationLabel: "Italy (Public)", ...over });

test("the chart's rows follow the installments, in the template's wording for that count", () => {
  const labels = REFERENCE_THEME.fee;
  const two = themedFeeRows(fee(), labels);
  assert.deepEqual(two.map((r) => r.label), [labels.admin.label, labels.two[0].label, labels.two[1].label, labels.total]);
  assert.deepEqual(two.map((r) => r.value), [300, 900, 900, 2100]);
  assert.ok(two.at(-1).total);

  const three = themedFeeRows(fee({ installmentAmounts: [600, 600, 600] }), labels);
  assert.deepEqual(three.slice(1, 4).map((r) => r.label), labels.three.map((l) => l.label));

  const one = themedFeeRows(fee({ installmentAmounts: [1800] }), labels);
  assert.deepEqual(one.map((r) => r.label), [labels.admin.label, labels.single.label, labels.total]);
});

test("a visa-only chart has no administrative charge; a backup country's has nothing else", () => {
  const labels = REFERENCE_THEME.fee;
  const visa = themedFeeRows(fee({ isVisaOnly: true, adminCharge: 0, consultancyFee: 500, installmentAmounts: [500], total: 500 }), labels);
  assert.deepEqual(visa.map((r) => r.label), [labels.visa.label, labels.total]);
  const backup = themedFeeRows(fee({ isBackup: true, adminCharge: 450, installmentAmounts: [0], total: 450 }), labels);
  assert.deepEqual(backup.map((r) => r.label), ["Administrative fee (Italy (Public))", labels.total]);
});

test("a discount is noted on the total, in the chart's amount format", () => {
  const rows = themedFeeRows(fee({ discount: 200, total: 1900 }), REFERENCE_THEME.fee);
  assert.equal(rows.at(-1).note, "Includes a discount of 200 €, already applied above");
});

// ------------------------------------------------------------ the wording parser

test("wording from before the builder could style anything parses exactly as it did", () => {
  const blocks = wordingToBlocks("<h1>1. Scope</h1><p><strong>Bold</strong> text</p><ul><li><p>One</p></li></ul>", {}, { feeTable: false });
  assert.deepEqual(blocks, [
    { kind: "richHeading", level: 1, runs: [{ text: "1. Scope", bold: undefined, italic: undefined, underline: undefined }], indent: undefined },
    {
      kind: "richParagraph",
      runs: [
        { text: "Bold", bold: true, italic: undefined, underline: undefined },
        { text: " text", bold: undefined, italic: undefined, underline: undefined },
      ],
      indent: undefined,
    },
    { kind: "richList", items: [{ runs: [{ text: "One", bold: undefined, italic: undefined, underline: undefined }], indent: 0, ordered: false, number: undefined }] },
  ]);
});

test("the builder's text formatting reaches the PDF", () => {
  const [p] = wordingToBlocks(
    '<p><span style="color: rgb(82, 190, 150); font-family: &quot;Open Sans&quot;; font-size: 12pt; background-color: #fff2cc">green</span> <s>gone</s> <span style="font-size: 16px">px</span></p>',
    {},
    { feeTable: false }
  );
  const [green, space, gone, , px] = p.runs;
  assert.equal(green.color, "#52be96");
  assert.equal(green.font, "Open Sans");
  assert.equal(green.size, 12);
  assert.equal(green.highlight, "#fff2cc");
  assert.equal(space.text, " ", "the space between two formatted words is kept");
  assert.equal(gone.strike, true);
  assert.equal(px.size, 12);
});

test("paragraph options — alignment, spacing, rule, shade — reach the PDF", () => {
  const [p] = wordingToBlocks(
    '<p data-line-height="1.5" data-space-before="6" data-space-after="0" data-rule="#52be96" data-shade="rgb(238, 248, 244)" style="text-align: center; line-height: 1.5">x</p>',
    {},
    { feeTable: false }
  );
  assert.deepEqual(p.format, { align: "center", lineHeight: 1.5, spaceBefore: 6, spaceAfter: 0, rule: "#52be96", shade: "#eef8f4" });
});

test("a list's own bullet, numbering and colour reach the PDF", () => {
  const [ul, ol, typed] = wordingToBlocks(
    '<ul data-bullet="check" data-marker-color="#c00000"><li><p>a</p></li></ul><ol data-numbering="lower-roman"><li><p>b</p></li></ol><ol type="A"><li><p>c</p></li></ol>',
    {},
    { feeTable: false }
  );
  assert.equal(ul.items[0].bullet, "check");
  assert.equal(ul.items[0].markerColor, "#c00000");
  assert.equal(ol.items[0].numbering, "lower-roman");
  assert.equal(typed.items[0].numbering, "upper-alpha");
});

test("table column widths, cell colours, spans and line colour reach the PDF", () => {
  const [t] = wordingToBlocks(
    '<table data-border="#726f73"><tbody><tr><th colwidth="300"><p>Payment</p></th><th colwidth="100" data-fill="#52be96"><p style="text-align: right">Amount</p></th></tr><tr><td colspan="2"><p>Both</p></td></tr></tbody></table>',
    {},
    { feeTable: false }
  );
  assert.deepEqual(t.widths, [0.75, 0.25]);
  assert.equal(t.border, "#726f73");
  assert.equal(t.rows[0].header, true);
  assert.equal(t.rows[0].cells[1].fill, "#52be96");
  assert.equal(t.rows[0].cells[1].align, "right");
  assert.equal(t.rows[1].cells[0].colspan, 2);
});

test("a page break and a horizontal line are blocks of their own", () => {
  const blocks = wordingToBlocks('<p>a</p><div data-page-break="true"></div><hr><p>b</p>', {}, { feeTable: false });
  assert.deepEqual(blocks.map((b) => b.kind), ["richParagraph", "pageBreak", "rule", "richParagraph"]);
});

// ------------------------------------------------------------ the Word import

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const run = (t, rpr = "") => `<w:r><w:rPr>${rpr}<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
const heading = (t) =>
  `<w:p><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="52BE96"/></w:pBdr><w:spacing w:before="200" w:after="80" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr>${run(t, '<w:b/><w:color w:val="52BE96"/><w:sz w:val="23"/>')}</w:p>`;
const bullet = (t) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr><w:spacing w:after="40" w:line="252" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>${run(t)}</w:p>`;
const para = (t, rpr = "") => `<w:p><w:pPr><w:spacing w:after="60" w:line="252" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>${run(t, rpr)}</w:p>`;
const subhead = (t) => `<w:p><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="40"/></w:pPr>${run(t, '<w:b/><w:color w:val="726F73"/>')}</w:p>`;
const cell = (t, fill, color) =>
  `<w:tc><w:tcPr><w:tcW w:w="8200" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:fill="${fill}"/>` : ""}</w:tcPr><w:p>${run(t, color ? `<w:b/><w:color w:val="${color}"/>` : "")}</w:p></w:tc>`;
const feeTable = `<w:tbl><w:tblPr><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="726F73"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="8200"/><w:gridCol w:w="2600"/></w:tblGrid>
  <w:tr>${cell("Payment", "52BE96", "FFFFFF")}${cell("Amount", "52BE96", "FFFFFF")}</w:tr>
  <w:tr>${cell("Administrative charges, paid on signing")}${cell("300 €")}</w:tr>
  <w:tr>${cell("First installment, on signing")}${cell("900 €")}</w:tr>
  <w:tr>${cell("Second installment, on acceptance")}${cell("900 €")}</w:tr>
  <w:tr>${cell("Total Professional Fee", "EEF8F4")}${cell("2,100 €", "EEF8F4")}</w:tr></w:tbl>`;
const document = (body) =>
  `<w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
const styles = `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
const numbering = `<w:numbering ${W}><w:abstractNum w:abstractNumId="3"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:rPr><w:rFonts w:ascii="Arial"/><w:color w:val="52BE96"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="3"/></w:num></w:numbering>`;

const contract = document(
  heading("1. Scope of Services") +
    bullet("Student Counselling") +
    bullet("Securing Admission") +
    subhead("What the Portal Provides") +
    para("On signing, the student will receive access.") +
    para("A sentence with ", "") +
    `<w:p><w:pPr><w:spacing w:after="60" w:line="252" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>${run("red words", '<w:color w:val="C00000"/>')}</w:p>` +
    heading("7. Professional Fee") +
    feeTable +
    heading("14. Authorisation") +
    para("The client confirms they have read it.") +
    `<w:p>${run("_________________________________")}</w:p>` +
    `<w:p>${run("(Signature) Client")}</w:p>` +
    `<w:p>${run("[Client Name]")}</w:p>`
);

test("a Word contract's look becomes the template's theme", () => {
  const { theme } = docxToTemplate({ document: contract, styles, numbering }, new DOMParser());
  assert.equal(theme.page.size, "LETTER");
  assert.equal(theme.page.margin, 36);
  assert.equal(theme.body.font, "Carlito");
  assert.equal(theme.body.size, 10);
  assert.equal(theme.body.align, "justify");
  assert.equal(theme.body.lineHeight, 1.28);
  assert.equal(theme.body.spaceAfter, 3);
  assert.deepEqual(
    { ...theme.headings[0] },
    { font: "Carlito", size: 11.5, color: "#52be96", bold: true, italic: false, rule: "#52be96", spaceBefore: 10, spaceAfter: 4 }
  );
  assert.equal(theme.headings[1].color, "#726f73", "the bold grey line kept with the next paragraph is Heading 2");
  assert.equal(theme.list.bullet, "square");
  assert.equal(theme.list.color, "#52be96");
  assert.equal(theme.list.spaceAfter, 2);
});

test("the payment table becomes the payment chart, lending it its colours and wording", () => {
  const { html, theme } = docxToTemplate({ document: contract, styles, numbering }, new DOMParser());
  assert.ok(html.includes("<p>{{fee_table}}</p>"));
  assert.ok(!html.includes("<table"), "no sample figures left in the wording");
  assert.equal(theme.table.headerFill, "#52be96");
  assert.equal(theme.table.headerText, "#ffffff");
  assert.equal(theme.table.border, "#726f73");
  assert.equal(theme.table.totalFill, "#eef8f4");
  assert.equal(theme.fee.admin.label, "Administrative charges, paid on signing");
  assert.deepEqual(theme.fee.two.map((l) => l.label), ["First installment, on signing", "Second installment, on acceptance"]);
  assert.deepEqual(theme.fee.amount, { symbol: "after", decimals: "when-needed" });
});

test("the wording keeps only what differs from the theme, and not the signature lines", () => {
  const { html, notes } = docxToTemplate({ document: contract, styles, numbering }, new DOMParser());
  assert.ok(html.startsWith("<h1>1. Scope of Services</h1><ul><li><p>Student Counselling</p></li>"), html.slice(0, 120));
  assert.ok(html.includes("<h2>What the Portal Provides</h2>"));
  assert.ok(html.includes('<span style="color: #c00000">red words</span>'), "a colour of its own stays on its text");
  assert.ok(!/signature|client name|____/i.test(html));
  assert.ok(notes.some((n) => /signature lines/.test(n)));
  assert.ok(notes.some((n) => /payment chart/.test(n)));
});

test("a staff contract's tables stay tables", () => {
  const { html } = docxToTemplate({ document: contract, styles, numbering }, new DOMParser(), { feeTable: false });
  assert.ok(html.includes("<table"));
  assert.ok(!html.includes("{{fee_table}}"));
});

test("Word's bullet characters are recognised in their fonts", () => {
  assert.equal(bulletShape("", "Wingdings"), "square");
  assert.equal(bulletShape("", "Symbol"), "disc");
  assert.equal(bulletShape("o", "Courier New"), "circle");
  assert.equal(bulletShape("", "Wingdings"), "arrow");
  assert.equal(bulletShape("", "Wingdings"), "check");
  assert.equal(bulletShape("–", null), "dash");
  assert.equal(bulletShape("▪", "Arial"), "square");
});

test("what the import brings in round-trips through the PDF parser", () => {
  const { html } = docxToTemplate({ document: contract, styles, numbering }, new DOMParser());
  const blocks = wordingToBlocks(html, {});
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["richHeading", "richList", "richHeading", "richParagraph", "richParagraph", "richParagraph", "richHeading", "feeTable", "richHeading", "richParagraph"]
  );
  assert.equal(blocks[5].runs[0].color, "#c00000");
});
