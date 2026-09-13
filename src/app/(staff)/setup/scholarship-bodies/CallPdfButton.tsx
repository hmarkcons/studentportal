"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { downloadScholarshipCall, removeScholarshipCall } from "@/lib/actions/scholarshipCall";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/**
 * Keeps a copy of the official call against the body.
 *
 * Every region takes last year's PDF down the week the new one appears, so a
 * link on its own stops answering exactly when somebody needs to check what a
 * student was advised from. The stored copy is what makes that answerable in
 * March.
 */
export function CallPdfButton({
  bodyId,
  hasStored,
  storedUrl,
  language,
  fetchedAt,
  hasLink,
}: {
  bodyId: string;
  hasStored: boolean;
  /** A signed link to the stored copy, made on the server. */
  storedUrl: string | null;
  language: string | null;
  fetchedAt: string | null;
  /** Whether there is a call_pdf_url to download from at all. */
  hasLink: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"download" | "remove" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending("download");
    setError(null);
    setMessage(null);
    const result = await downloadScholarshipCall(bodyId);
    setPending(null);
    if (result?.error) setError(result.error);
    else {
      setMessage(result.note ?? "Saved.");
      router.refresh();
    }
  }

  async function remove() {
    if (!confirm("Remove the stored copy of this call? The link stays.")) return;
    setPending("remove");
    setError(null);
    const result = await removeScholarshipCall(bodyId);
    setPending(null);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {hasStored && storedUrl && (
          <a
            href={storedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
          >
            📄 Open the call
          </a>
        )}
        {/* Most regions publish in Italian only. Worth knowing before it is
            sent to a student. */}
        {hasStored && language === "it" && <Badge tone="warning">Italian</Badge>}
        {hasStored && language === "en" && <Badge tone="success">English</Badge>}
        {hasStored && language === "unknown" && <Badge tone="neutral">language unknown</Badge>}

        <Button type="button" size="sm" pending={pending === "download"} onClick={download} disabled={!hasLink}>
          {hasStored ? "Download again" : "Download the call"}
        </Button>
        {hasStored && (
          <Button type="button" size="sm" pending={pending === "remove"} onClick={remove}>
            Remove copy
          </Button>
        )}
      </div>

      {!hasLink && <p className="text-[11px] text-muted">Add a call PDF link above, then this can fetch it.</p>}
      {hasStored && fetchedAt && (
        <p className="text-[11px] text-muted">Saved {new Date(fetchedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}</p>
      )}
      {message && <p className="text-[11px] text-success">{message}</p>}
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
