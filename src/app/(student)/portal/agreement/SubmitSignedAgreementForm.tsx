"use client";

import { useActionState, useRef, useState } from "react";
import { submitSignedAgreement } from "@/lib/actions/portal-agreement";
import { Button } from "@/components/ui/Button";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { MAX_UPLOAD_BYTES, fileSizeError, formatFileSize, isShrinkableImage, limitHint, reduceHint, shrunkNote } from "@/lib/fileSize";
import { shrinkImageToFit } from "@/components/shrinkImage";
import { stageFile } from "@/lib/stageFile";
import { toast } from "@/lib/toast";
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

export function SubmitSignedAgreementForm({
  agreementId,
  studentId,
  needsDocument = true,
  needsVideo = true,
}: {
  agreementId: string;
  studentId: string;
  // Which halves are outstanding. After staff send back only the video, asking
  // for the signed agreement again is work the student has already done — and
  // re-uploading it would reset its approval.
  needsDocument?: boolean;
  needsVideo?: boolean;
}) {
  const submit = submitSignedAgreement.bind(null, agreementId, studentId);
  // A successful submission replaces this form with "Submitted — waiting for
  // your counsellor", so the confirmation is a toast: there is no button left
  // for it to sit beside.
  const action = async (prev: unknown, formData: FormData) => {
    const result = await submit(prev, formData);
    if (!result?.error) toast("Submitted. Your counsellor will check the video and agreement shortly.");
    return result;
  };
  const [state, formAction, pending] = useActionState(action, undefined);
  const [video, setVideo] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentNote, setDocumentNote] = useState<string | null>(null);
  // What the form posts: references to files already in storage (see
  // stageFile). Posting the files themselves would run into Vercel's 4.5 MB
  // request limit, which a consent video and a signed agreement together
  // regularly passed.
  const [documentRef, setDocumentRef] = useState<string | null>(null);
  const [videoRef, setVideoRef] = useState<string | null>(null);
  const [videoNote, setVideoNote] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [documentShrinkable, setDocumentShrinkable] = useState<File | null>(null);
  const [uploading, setUploading] = useState(0);
  const documentPick = useRef(0);
  const videoPick = useRef(0);
  const both = needsDocument && needsVideo;
  // Only what is being asked for can block the button, and only once it is uploaded.
  const ready = uploading === 0 && (!needsVideo || Boolean(videoRef)) && (!needsDocument || Boolean(documentRef));

  async function stageDocument(file: File, pick: number, doneNote: string | null) {
    setUploading((n) => n + 1);
    setDocumentNote(`Uploading ${formatFileSize(file.size)}…`);
    const result = await stageFile(file);
    setUploading((n) => n - 1);
    if (pick !== documentPick.current) return;
    if (!result.ok) {
      setDocumentNote(null);
      setDocumentError(result.error);
      return;
    }
    setDocumentRef(result.ref);
    setDocumentName(file.name);
    setDocumentNote(doneNote ?? `Uploaded · ${formatFileSize(file.size)}`);
  }

  /**
   * The signed agreement, held to the same limit as every other document.
   *
   * This input is visually hidden behind its label, so FileField cannot be
   * dropped in here — the check, the upload and the offer to shrink are done
   * inline and reported under the picker.
   *
   * A photographed signed agreement is the commonest case of being over the
   * limit, so the student is offered "Shrink to fit" and chooses. A scanned
   * PDF that is too big is refused with advice: re-encoding a signed legal
   * document is not something to do behind someone's back.
   */
  async function chooseDocument(chosen: File | null) {
    const pick = ++documentPick.current;
    setDocumentError(null);
    setDocumentNote(null);
    setDocumentRef(null);
    setDocumentName(null);
    setDocumentShrinkable(null);
    if (!chosen) return;

    const tooLarge = fileSizeError(chosen.size, MAX_UPLOAD_BYTES, "agreement");
    if (!tooLarge) {
      await stageDocument(chosen, pick, null);
      return;
    }
    if (isShrinkableImage(chosen.type, chosen.name)) {
      setDocumentShrinkable(chosen);
      setDocumentError(tooLarge);
      return;
    }
    setDocumentError([tooLarge, reduceHint(chosen.type, chosen.name)].filter(Boolean).join(" "));
  }

  async function shrinkDocument() {
    const original = documentShrinkable;
    if (!original) return;
    const pick = documentPick.current;
    setDocumentShrinkable(null);
    setDocumentError(null);
    setDocumentNote(`Shrinking ${formatFileSize(original.size)}…`);
    setUploading((n) => n + 1);
    const result = await shrinkImageToFit(original, MAX_UPLOAD_BYTES);
    setUploading((n) => n - 1);
    if (pick !== documentPick.current) return;
    if (result.ok) {
      await stageDocument(result.file, pick, shrunkNote(result.from, result.to, MAX_UPLOAD_BYTES));
      return;
    }
    setDocumentNote(null);
    const advice =
      result.reason === "still_too_large"
        ? `Even fully compressed it is ${formatFileSize(result.smallest)}. Photograph one page at a time, or crop it.`
        : reduceHint(original.type, original.name);
    setDocumentError([fileSizeError(original.size, MAX_UPLOAD_BYTES, "agreement"), advice].filter(Boolean).join(" "));
  }

  // The recorded video goes to storage as soon as it exists, into the video
  // staging bucket (its own, larger limit), so pressing Submit sends only a
  // reference.
  async function attachVideo(file: File | null) {
    const pick = ++videoPick.current;
    setVideo(file);
    setVideoRef(null);
    setVideoError(null);
    setVideoNote(null);
    if (!file) return;
    setUploading((n) => n + 1);
    setVideoNote(`Uploading the video (${formatFileSize(file.size)})…`);
    const result = await stageFile(file, { video: true });
    setUploading((n) => n - 1);
    if (pick !== videoPick.current) return;
    if (!result.ok) {
      setVideoNote(null);
      setVideoError(result.error);
      return;
    }
    setVideoRef(result.ref);
    setVideoNote(`Video uploaded · ${formatFileSize(file.size)}`);
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium text-ink">
          {both ? "Submit your e-signed agreement" : needsVideo ? "Record your video again" : "Attach your signed agreement again"}
        </h4>
        {needsVideo && (
          <button
            type="button"
            onClick={() => setShowWhy(true)}
            className="rounded-md border border-primary px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
          >
            Why this video is needed?
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        {both
          ? "Record a short video confirming you are e-signing this agreement, then attach the signed document. Both are required."
          : needsVideo
            ? "Only the video needs redoing — your signed agreement is already on file and stays as it is."
            : "Only the signed document needs redoing — your video is already on file and stays as it is."}
      </p>

      {needsVideo && (
        <>
          <ConsentVideoRecorder onVideo={(f) => void attachVideo(f)} disabled={pending} />
          <input type="hidden" name="video" value={videoRef ?? ""} />
          {videoNote && (
            <p className="text-xs text-muted" aria-live="polite">
              {videoNote}
            </p>
          )}
          {videoError && video && (
            <p role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-danger bg-danger-bg px-2 py-1 text-xs font-medium text-danger">
              {videoError}
              <button
                type="button"
                onClick={() => void attachVideo(video)}
                className="rounded-md border border-danger bg-card px-2 py-0.5 font-medium text-danger hover:bg-danger-bg"
              >
                Try again
              </button>
            </p>
          )}
        </>
      )}

      {/* The native file input is styled out and driven by the label so it
          matches the bordered video picker above it — left bare it renders as
          unboxed "Choose File" text and has an intrinsic min width that pushes
          the submit button onto its own line. The chosen filename sits on the
          row below rather than between the two: at 768px the sidebar leaves
          this card barely 440px, and inline it wrapped the button away from
          the picker it is meant to sit beside. */}
      <div className="flex flex-wrap items-center gap-2">
        {needsDocument && (
          <label className="cursor-pointer whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg">
            {documentName ? "Change file" : "Choose file"}
            <input
              type="file"
              accept={ACCEPTED_DOCUMENT_ACCEPT}
              className="sr-only"
              disabled={pending}
              onChange={(e) => void chooseDocument(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        {needsDocument && <input type="hidden" name="agreement" value={documentRef ?? ""} />}
        {/* Gated in the button rather than with `required` on the input: a
            visually-hidden required control can't be focused for the native
            validation bubble, and Chrome then blocks submission silently. */}
        <Button type="submit" variant="primary" size="sm" pending={pending} disabled={!ready} status={{ state, label: "Submitted." }}>
          {both ? "Submit signed agreement" : needsVideo ? "Submit new video" : "Submit signed agreement"}
        </Button>
      </div>
      {needsDocument && (
        <>
          <p className="truncate text-xs text-muted">
            {documentName ?? "No file chosen"} · {limitHint()}
          </p>
          {documentNote && <p className="text-xs text-muted">{documentNote}</p>}
          {documentError && (
            <div role="alert" className="flex flex-col gap-1.5 rounded-md border border-danger bg-danger-bg px-2 py-1.5 text-xs font-medium text-danger">
              <span>{documentError}</span>
              {documentShrinkable && (
                <span className="flex flex-wrap items-center gap-2 font-normal">
                  <button
                    type="button"
                    onClick={() => void shrinkDocument()}
                    className="w-fit rounded-md border border-danger bg-card px-2 py-0.5 font-medium text-danger hover:bg-danger-bg"
                  >
                    Shrink to fit
                  </button>
                  <span>makes the photo smaller so it fits, keeping it readable. Or choose a smaller file.</span>
                </span>
              )}
            </div>
          )}
        </>
      )}
      {!ready && (
        <p className="text-xs text-muted">
          {uploading > 0
            ? "Uploading — submission unlocks as soon as it is done."
            : needsVideo && needsDocument && !videoRef && !documentRef
            ? "Record the video and attach your signed agreement — submission stays locked until both are here."
            : needsVideo && !videoRef
              ? "Record or attach the video first — submission stays locked until then."
              : "Attach your signed agreement — submission stays locked until then."}
        </p>
      )}

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}

      {showWhy && <WhyVideoDialog onClose={() => setShowWhy(false)} />}
    </form>
  );
}
