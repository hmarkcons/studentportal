"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { conversionKind, keptAsItIsNote, nameFromUrl } from "@/lib/pdfConversion";
import { saveBlob } from "@/components/saveBlob";
import { toast } from "@/lib/toast";

/**
 * A stored file, downloaded as a PDF (src/lib/pdfConversion.ts): what was a
 * plain link to it. Clicked, the file is fetched, made a PDF in the browser
 * and saved under its own name, ".pdf". A kind that cannot be a PDF — a .zip,
 * a video — is saved as it is, and the person told so.
 *
 * `original` is for staff: a small "original" link beside it opens the file as
 * it was uploaded, for when the Word file itself is wanted. A student and a
 * university have the PDF only, so the file's own address is not on the page
 * for them at all.
 */
export function StoredFileLink({
  href,
  name,
  children,
  original = false,
  className = "",
  ...rest
}: {
  /** The file's signed link; nothing to download without one. */
  href: string | null | undefined;
  /** Its name as uploaded — what the PDF is called, and how its kind is told. Read from the link when not given. */
  name?: string | null;
  children?: ReactNode;
  /** Staff only: offer the file as it was uploaded, too. */
  original?: boolean;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "name" | "children" | "className">) {
  const [busy, setBusy] = useState(false);
  if (!href) return <span className={className}>{children ?? name ?? "File"}</span>;
  const fileName = name?.trim() || nameFromUrl(href);
  const kind = conversionKind(fileName);

  async function download(url: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        toast(
          response.status === 400 || response.status === 403
            ? "This link has expired — reload the page and try again."
            : `${fileName} could not be downloaded just now — try again.`,
          "danger"
        );
        return;
      }
      const blob = await response.blob();
      const { convertToPdf } = await import("@/lib/toPdf");
      const pdf = await convertToPdf(blob, fileName);
      if (pdf.ok) {
        saveBlob(pdf.blob, pdf.name);
      } else {
        saveBlob(blob, fileName);
        toast(keptAsItIsNote(fileName, pdf.why));
      }
    } catch {
      toast(`${fileName} could not be downloaded — check your connection and try again.`, "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void download(href)}
        disabled={busy}
        aria-busy={busy || undefined}
        title={kind === "none" ? `Download ${fileName}` : `Download ${fileName} as a PDF`}
        className={`cursor-pointer text-left disabled:cursor-wait disabled:opacity-60 ${className}`}
        data-file-download={kind}
        {...rest}
      >
        {children ?? fileName}
      </button>
      {busy && (
        <span role="status" className="ml-1.5 text-[11px] text-muted">
          {kind === "pdf" || kind === "none" ? "Downloading…" : "Making the PDF…"}
        </span>
      )}
      {original && kind !== "pdf" && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="ml-1.5 shrink-0 text-[11px] text-muted hover:text-primary hover:underline"
          title={`${fileName}, as it was uploaded`}
          data-original-file
        >
          original
        </a>
      )}
    </>
  );
}
