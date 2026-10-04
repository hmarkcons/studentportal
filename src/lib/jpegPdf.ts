// A one-page PDF holding one JPEG, for "Download all": a photographed
// passport or a scanned transcript goes into the ZIP as a PDF like the rest.
//
// Written by hand rather than with a PDF library because the whole of it is
// six small objects: a JPEG can be placed in a PDF as it is (DCTDecode), with
// no decoding or re-encoding. The browser turns any picture into a JPEG first
// (on a canvas, which also applies the photo's rotation), so this is the only
// kind it is given. Pure — scripts/jpeg-pdf-test.mjs.

/** A4, in PDF points. */
const A4 = { short: 595.28, long: 841.89 };
/** The white border around the picture, in points. */
const MARGIN = 24;

const ascii = (s: string) => new TextEncoder().encode(s);
const num = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * The PDF's bytes. The page is A4, upright for a tall picture and on its side
 * for a wide one, and the picture is fitted inside the margin, centred,
 * keeping its proportions.
 */
export function jpegToPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  if (!(width > 0 && height > 0)) throw new Error("A picture with no size cannot be placed on a page.");
  const landscape = width > height;
  const pageW = landscape ? A4.long : A4.short;
  const pageH = landscape ? A4.short : A4.long;
  const scale = Math.min((pageW - 2 * MARGIN) / width, (pageH - 2 * MARGIN) / height);
  const drawW = width * scale;
  const drawH = height * scale;
  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;

  const content = ascii(`q ${num(drawW)} 0 0 ${num(drawH)} ${num(x)} ${num(y)} cm /Im0 Do Q\n`);
  const objects: Uint8Array[][] = [
    [ascii("<< /Type /Catalog /Pages 2 0 R >>")],
    [ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")],
    [
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageW)} ${num(pageH)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
      ),
    ],
    [
      ascii(
        `<< /Type /XObject /Subtype /Image /Width ${Math.round(width)} /Height ${Math.round(height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
      ),
      jpeg,
      ascii("\nendstream"),
    ],
    [ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii("endstream")],
  ];

  // The header's second line is binary, so tools treat the file as binary.
  const parts: Uint8Array[] = [ascii("%PDF-1.4\n"), new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
  let offset = parts.reduce((n, p) => n + p.length, 0);
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(offset);
    const chunk = [ascii(`${i + 1} 0 obj\n`), ...body, ascii("\nendobj\n")];
    for (const c of chunk) {
      parts.push(c);
      offset += c.length;
    }
  });
  // Each cross-reference line is exactly twenty bytes, as the format requires.
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`,
  ].join("");
  parts.push(ascii(xref));

  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
