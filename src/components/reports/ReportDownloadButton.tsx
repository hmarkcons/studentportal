"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";

const TYPES = {
  pdf: { mime: "application/pdf", label: "Download PDF", busy: "Preparing PDF…", Icon: FileDown, ext: "pdf" },
  xlsx: { mime: "spreadsheetml", label: "Download Excel", busy: "Preparing Excel…", Icon: FileSpreadsheet, ext: "xlsx" },
} as const;

/** The file name the route gave the download, from its Content-Disposition. */
function fileNameOf(response: Response, fallback: string) {
  const header = response.headers.get("Content-Disposition") ?? "";
  return /filename="([^"]+)"/.exec(header)?.[1] ?? fallback;
}

/**
 * Downloads a report (its download/route.ts) as PDF or Excel — the Documents
 * checklist, Applications & portal logins.
 *
 * Fetched rather than linked, as the status report button is: a PDF of every
 * registered student takes ten seconds or more to draw, and a plain link
 * gives no sign that anything is happening — and should the download be
 * refused, this says why instead of opening a blank tab.
 */
export function ReportDownloadButton({
  href,
  format,
  compact = false,
  title,
  fallbackName = "Report",
}: {
  href: string;
  format: keyof typeof TYPES;
  /** A small "PDF" button for a table row, named by its title. */
  compact?: boolean;
  title?: string;
  /** The file's name should the route not give one, without its extension. */
  fallbackName?: string;
}) {
  const type = TYPES[format];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok || !(response.headers.get("Content-Type") ?? "").includes(type.mime)) {
        setError((await response.text().catch(() => "")) || "The file could not be prepared.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameOf(response, `${fallbackName}.${type.ext}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Long enough for the browser to have taken the file.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("The file could not be prepared. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "sm" : "md"}
        pending={pending}
        onClick={download}
        data-download={compact ? `${format}-one` : format}
        data-href={href}
        title={title}
        aria-label={compact ? title : undefined}
      >
        <type.Icon aria-hidden className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {compact ? (pending ? "…" : format.toUpperCase()) : pending ? type.busy : type.label}
      </Button>
      {error && (
        <span role="alert" className="max-w-xs text-right text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
