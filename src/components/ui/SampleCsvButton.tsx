"use client";

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
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={download} className="text-xs font-medium text-primary hover:underline">
      Download sample CSV
    </button>
  );
}
