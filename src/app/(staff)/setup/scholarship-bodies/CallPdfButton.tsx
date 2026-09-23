"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { downloadScholarshipCall, removeScholarshipCall } from "@/lib/actions/scholarshipCall";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useButtonAction } from "@/components/useButtonAction";

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
  const dl = useButtonAction();
  const rm = useButtonAction();
  // What the download says about the copy it kept, said beside the button.
  const [note, setNote] = useState<string | null>(null);

  async function download() {
    setNote(null);
    await dl.run(async () => {
      const result = await downloadScholarshipCall(bodyId);
      if (!result?.error) {
        setNote(result.note ?? null);
        router.refresh();
      }
      return result;
    });
  }

  async function remove() {
    if (!confirm("Remove the stored copy of this call? The link stays.")) return;
    // Once the copy is gone so is this button, so success is a toast.
    await rm.run(async () => {
      const result = await removeScholarshipCall(bodyId);
      if (!result?.error) router.refresh();
      return result;
    }, { toast: "Removed." });
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

        <Button
          type="button"
          size="sm"
          pending={dl.pending}
          onClick={download}
          disabled={!hasLink}
          status={{ state: dl.state, label: note ?? "Saved.", showError: true }}
        >
          {hasStored ? "Download again" : "Download the call"}
        </Button>
        {hasStored && (
          <Button
            type="button"
            size="sm"
            pending={rm.pending}
            onClick={remove}
            status={{ state: rm.state, label: "Removed.", showError: true }}
          >
            Remove copy
          </Button>
        )}
      </div>

      {!hasLink && <p className="text-[11px] text-muted">Add a call PDF link above, then this can fetch it.</p>}
      {hasStored && fetchedAt && (
        <p className="text-[11px] text-muted">Saved {new Date(fetchedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}</p>
      )}
    </div>
  );
}
