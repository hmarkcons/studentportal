"use client";

import { csvBlob, saveBlob } from "@/components/saveBlob";

export function SampleCsvButton({
  filename,
  headers,
  exampleRow,
}: {
  filename: string;
  headers: string[];
  exampleRow: string[];
}) {
  function download() {
    const lines = [headers.join(","), exampleRow.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")];
    // UTF-8 with its mark: Excel on a Mac or Windows opens it with the example's letters intact.
    saveBlob(csvBlob(lines), filename);
  }

  return (
    <button type="button" onClick={download} className="text-xs font-medium text-primary hover:underline">
      Download sample CSV
    </button>
  );
}
