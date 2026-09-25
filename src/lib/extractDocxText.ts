import type { DocxImport } from "./docxImport";

export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * A Word document as agreement-builder wording plus the theme it looks like
 * (see docxImport.ts): colours, fonts, headings, bullets, table shading and
 * the page all come across, where mammoth kept only bold, italic, underline
 * and headings. Runs in the browser; `feeTable` off for a staff agreement,
 * whose tables are never the payment chart.
 */
export async function importDocxTemplate(file: File, { feeTable = true }: { feeTable?: boolean } = {}): Promise<DocxImport> {
  const [{ default: JSZip }, { docxToTemplate }] = await Promise.all([import("jszip"), import("./docxImport")]);
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const part = async (path: string) => (zip.file(path) ? await zip.file(path)!.async("string") : null);
  const document = await part("word/document.xml");
  if (!document) throw new Error("That file is not a Word document.");
  return docxToTemplate(
    {
      document,
      styles: await part("word/styles.xml"),
      numbering: await part("word/numbering.xml"),
      theme: await part("word/theme/theme1.xml"),
    },
    new DOMParser(),
    { feeTable }
  );
}
