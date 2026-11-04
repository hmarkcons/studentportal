/**
 * Hands a file made in the browser to the browser to save, in a way every
 * engine accepts: the link is put in the page before it is clicked (Firefox
 * ignores a click on a link that is not in the document), and its address is
 * let go a minute later rather than at once (Safari can drop a download whose
 * address is revoked in the same moment it is clicked).
 */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * A CSV as Excel reads it on Windows and on a Mac: UTF-8 with its byte-order
 * mark, without which Excel takes the file for the machine's own encoding and
 * turns é, — and every Urdu name into garbage; and lines ended CRLF, as the
 * CSV standard has them. readCsvFile drops the mark when a file comes back.
 */
export function csvBlob(lines: readonly string[]): Blob {
  return new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
}
