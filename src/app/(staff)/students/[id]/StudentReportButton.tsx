"use client";

import { useState } from "react";
import { FileChartColumn } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** The file name the route gave the report, from its Content-Disposition. */
function fileNameOf(response: Response, fallback: string) {
  const header = response.headers.get("Content-Disposition") ?? "";
  return /filename="([^"]+)"/.exec(header)?.[1] ?? fallback;
}

/**
 * Downloads the student's status report (./report/route.ts): a PDF of
 * everything on their record, done, in progress and still to do.
 *
 * Fetched rather than linked, so the button can say it is working — reading
 * the whole record and drawing it takes a few seconds — and say why, should
 * the report be refused, instead of opening a blank tab.
 */
export function StudentReportButton({ studentId }: { studentId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/students/${studentId}/report`, { cache: "no-store" });
      if (!response.ok || !(response.headers.get("Content-Type") ?? "").includes("application/pdf")) {
        setError((await response.text().catch(() => "")) || "The report could not be prepared.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameOf(response, "Status-report.pdf");
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Long enough for the browser to have taken the file.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("The report could not be prepared. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
      <Button
        type="button"
        variant="outline-primary"
        size="sm"
        pending={pending}
        onClick={download}
        data-student-report
        title="A PDF of everything on this student's record — done, in progress and still to do"
      >
        <FileChartColumn aria-hidden className="h-3.5 w-3.5" />
        {pending ? "Preparing report…" : "Status report (PDF)"}
      </Button>
    </span>
  );
}
