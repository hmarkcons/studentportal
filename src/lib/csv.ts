// Minimal CSV parser — handles quoted fields (with embedded commas/quotes)
// and both \n and \r\n line endings. Not a full RFC 4180 implementation,
// but sufficient for the small admin-authored import files this project
// uses (university/program bulk import).

/**
 * An uploaded CSV's text, whichever way it was saved.
 *
 * `file.text()` reads every file as UTF-8. Excel on Windows saves "CSV (Comma
 * delimited)" in Windows-1252, where "à" is one byte that is not UTF-8 — so
 * it came back as "�", without an error, and an import of Italian bodies
 * added "Universit� degli Studi di Brescia" beside the real "Università degli
 * Studi di Brescia" (2026-09-30). Valid UTF-8 is read as UTF-8, its byte-order
 * mark dropped; anything else is read as Windows-1252, which every byte is.
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** An uploaded CSV file's text — see decodeCsvBytes. Use this, never `file.text()`. */
export async function readCsvFile(file: Blob): Promise<string> {
  return decodeCsvBytes(await file.arrayBuffer());
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // skip; \n (if present) handles the row break
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

// Parses a CSV into row objects keyed by its header row (trimmed, as-is —
// callers match against their own expected column names).
export function parseCsvWithHeader(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
}
