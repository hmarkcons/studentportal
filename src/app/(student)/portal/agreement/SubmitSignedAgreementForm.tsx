"use client";

import { useActionState, useRef, useState } from "react";
import { submitSignedAgreement } from "@/lib/actions/portal-agreement";
import { Button } from "@/components/ui/Button";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { ConsentVideoRecorder } from "./ConsentVideoRecorder";

function WhyVideoDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Why this video is needed</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-2 text-sm text-ink">
          <p>
            Because you&apos;re signing electronically rather than in front of our team in Karachi, the video is what proves the
            signature is genuinely yours.
          </p>
          <p>
            It records you confirming, in your own words, that you have read the agreement and are e-signing it yourself. That
            makes the signature attributable to you later — so the agreement can&apos;t be disputed or denied further down the
            line, by either side.
          </p>
          <p className="text-muted">
            Keep it short: say your full name, today&apos;s date, and that you are signing this agreement with HMARK
            Consultants of your own accord.
          </p>
        </div>
        <div className="mt-4">
          <Button type="button" variant="primary" size="sm" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SubmitSignedAgreementForm({ agreementId, studentId }: { agreementId: string; studentId: string }) {
  const action = submitSignedAgreement.bind(null, agreementId, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [video, setVideo] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // The recorded Blob only exists in memory, so mirror it into a real file
  // input the form can post. DataTransfer is the supported way to set one.
  function attachVideo(file: File | null) {
    setVideo(file);
    if (!videoInputRef.current) return;
    if (!file) {
      videoInputRef.current.value = "";
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    videoInputRef.current.files = dt.files;
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium text-ink">Submit your e-signed agreement</h4>
        <button
          type="button"
          onClick={() => setShowWhy(true)}
          className="rounded-md border border-primary px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
        >
          Why this video is needed?
        </button>
      </div>
      <p className="text-xs text-muted">
        Record a short video confirming you are e-signing this agreement, then attach the signed document. Both are required.
      </p>

      <ConsentVideoRecorder onVideo={attachVideo} disabled={pending} />
      <input ref={videoInputRef} type="file" name="video" accept="video/*" className="sr-only" tabIndex={-1} aria-hidden />

      {/* The native file input is styled out and driven by the label so it
          matches the bordered video picker above it — left bare it renders as
          unboxed "Choose File" text and has an intrinsic min width that pushes
          the submit button onto its own line. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg">
          {documentName ? "Change signed agreement" : "Choose signed agreement"}
          <input
            type="file"
            name="agreement"
            accept={ACCEPTED_DOCUMENT_ACCEPT}
            className="sr-only"
            disabled={pending}
            onChange={(e) => setDocumentName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
        <span className="max-w-full truncate text-xs text-muted">{documentName ?? "No file chosen"}</span>
        {/* Gated in the button rather than with `required` on the input: a
            visually-hidden required control can't be focused for the native
            validation bubble, and Chrome then blocks submission silently. */}
        <Button type="submit" variant="primary" size="sm" pending={pending} disabled={!video || !documentName}>
          Submit signed agreement
        </Button>
      </div>
      {(!video || !documentName) && (
        <p className="text-xs text-muted">
          {!video && !documentName
            ? "Record the video and attach your signed agreement — submission stays locked until both are here."
            : !video
              ? "Record or attach the video first — submission stays locked until then."
              : "Attach your signed agreement — submission stays locked until then."}
        </p>
      )}

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.success && (
        <p className="text-xs text-success">Submitted. Your counselor will verify the video and agreement shortly.</p>
      )}

      {showWhy && <WhyVideoDialog onClose={() => setShowWhy(false)} />}
    </form>
  );
}
