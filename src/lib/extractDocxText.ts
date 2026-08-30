export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// Preserves headings, bold/italic/underline, and tables as HTML — used by
// the agreement builder's rich-text wording field so an uploaded Word
// document keeps its formatting instead of collapsing to plain text.
export async function extractDocxHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "u => u",
        "b => strong",
        "i => em",
      ],
    }
  );
  return result.value;
}
