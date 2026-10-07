"use client";

import { useActionState, useRef, useState } from "react";
import { ExternalLink, FileSignature, LoaderCircle, PenLine, Upload, X } from "lucide-react";
import { submitSignedAgreement } from "@/lib/actions/portal-agreement";
import { previewESignedAgreement, submitESignedAgreement } from "@/lib/actions/portal-esign";
import { SignatureCapture, type CapturedSignature } from "@/components/SignatureCapture";
import { Button } from "@/components/ui/Button";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { MAX_UPLOAD_BYTES, fileSizeError, formatFileSize, isShrinkableImage, limitHint, reduceHint, shrunkNote } from "@/lib/fileSize";
import { shrinkImageToFit } from "@/components/shrinkImage";
import { stageFile } from "@/lib/stageFile";
import { toast } from "@/lib/toast";
import { ConsentVideoRecorder } from "./ConsentVideoRecorder";
import { JoinedFilesList, useJoinedFiles } from "@/components/JoinedFiles";

function WhyVideoDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Why this video is needed</h3>
          <button type="button" onClick={onClose} className="rounded-md p-0.5 text-muted hover:bg-bg hover:text-ink" aria-label="Close">
            <X aria-hidden className="h-4 w-4" />
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
  canSignHere = true,
}: {
  agreementId: string;
  studentId: string;
  // Which halves are outstanding. After staff send back only the video, asking
  // for the signed agreement again is work the student has already done — and
  // re-uploading it would reset its approval.
  needsDocument?: boolean;
  needsVideo?: boolean;
  /** The agreement is final (staff have generated it), so it can be signed here. */
  canSignHere?: boolean;
}) {
  // How the signed agreement is given: signed here, in the portal — the
  // signature drawn or photographed and placed in the agreement — or a copy
  // signed on paper and uploaded, as before.
  const [method, setMethod] = useState<"esign" | "upload">(canSignHere ? "esign" : "upload");
  const [signature, setSignature] = useState<CapturedSignature | null>(null);
  const [signatureRef, setSignatureRef] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; for: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const esign = needsDocument && method === "esign";

  // A successful submission replaces this form with "Submitted — waiting for
  // your counsellor", so the confirmation is a toast: there is no button left
  // for it to sit beside.
  const action = async (prev: unknown, formData: FormData) => {
    const result = esign ? await submitESignedAgreement(agreementId, prev, formData) : await submitSignedAgreement(agreementId, studentId, prev, formData);
    if (!("error" in result && result.error)) toast("Submitted. Your counsellor will check the video and agreement shortly.");
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
  // A signed agreement photographed page by page: the pages are chosen
  // together, put in order, and joined into one PDF before it is uploaded.
  const documentInput = useRef<HTMLInputElement>(null);
  const addingMore = useRef(false);
  const [joining, setJoining] = useState(false);
  const joinedDocument = useJoinedFiles({
    limitBytes: MAX_UPLOAD_BYTES,
    onResult: (result) => {
      if (result.kind === "none") return void chooseDocument(null);
      if (result.kind === "single") return void chooseDocument(result.file);
      const pick = ++documentPick.current;
      setDocumentShrinkable(null);
      setDocumentRef(null);
      setDocumentName(null);
      if (result.kind === "error") {
        setDocumentNote(null);
        setDocumentError(result.error);
        return;
      }
      setDocumentError(null);
      void stageDocument(result.file, pick, result.note);
    },
    onBusy: (busy, note) => {
      setJoining(busy);
      if (!busy) return;
      ++documentPick.current;
      setDocumentRef(null);
      setDocumentName(null);
      setDocumentError(null);
      setDocumentShrinkable(null);
      setDocumentNote(note);
    },
  });
  // Signed here, the agreement is ready once its signed copy has been built
  // and shown — what is submitted is what was looked at.
  const documentReady = esign ? Boolean(signatureRef && preview && preview.for === signatureRef) : Boolean(documentRef);
  // Only what is being asked for can block the button, and only once it is uploaded.
  const ready = uploading === 0 && !joining && !previewing && (!needsVideo || Boolean(videoRef)) && (!needsDocument || documentReady);

  /** A signature chosen: sent to storage, then the agreement built with it, to look at. */
  async function adoptSignature(sig: CapturedSignature) {
    setSignError(null);
    setPreview(null);
    setSignatureRef(null);
    setSignature(sig);
    setPreviewing(true);
    const staged = await stageFile(sig.file);
    if (!staged.ok) {
      setPreviewing(false);
      setSignError(staged.error);
      return;
    }
    setSignatureRef(staged.ref);
    await buildPreview(staged.ref);
  }

  async function buildPreview(ref: string) {
    setPreviewing(true);
    setSignError(null);
    const result = await previewESignedAgreement(agreementId, ref);
    setPreviewing(false);
    if ("error" in result) {
      setSignError(result.error);
      return;
    }
    setPreview({ url: result.url, for: ref });
  }

  function changeSignature() {
    setSignature(null);
    setSignatureRef(null);
    setPreview(null);
    setSignError(null);
  }

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
          ? "Sign the agreement, look over the signed copy, and record a short video confirming you are signing it. Both are required."
          : needsVideo
            ? "Only the video needs redoing — your signed agreement is already on file and stays as it is."
            : "Only the signed agreement needs redoing — your video is already on file and stays as it is."}
      </p>

      {needsDocument && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-3" data-sign-step>
          <h5 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-ink">1</span>
            Sign the agreement
          </h5>
          <div role="radiogroup" aria-label="How to sign" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                [
                  "esign",
                  "Sign here in the portal",
                  canSignHere ? "Draw your signature, or upload a photo of it. Recommended." : "Available as soon as your counsellor has the agreement ready.",
                  PenLine,
                ],
                ["upload", "Upload a copy signed on paper", "Download it, sign it by hand, and upload the signed pages.", Upload],
              ] as const
            ).map(([key, label, hint, Icon]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={method === key}
                onClick={() => setMethod(key)}
                disabled={pending || (key === "esign" && !canSignHere)}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  method === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
                }`}
                data-sign-method={key}
              >
                <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${method === key ? "text-primary" : "text-muted"}`} />
                <span>
                  <span className="block text-sm font-medium text-ink">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </button>
            ))}
          </div>

          {method === "esign" &&
            (!signature ? (
              <SignatureCapture onSignature={(sig) => void adoptSignature(sig)} disabled={pending} />
            ) : (
              <div className="flex flex-col gap-3" data-esign-preview>
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className="flex h-16 w-40 items-center justify-center rounded-md border border-border p-1.5"
                    style={{ backgroundImage: "repeating-conic-gradient(#f1f1f1 0% 25%, #ffffff 0% 50%)", backgroundSize: "12px 12px" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a page image */}
                    <img src={signature.url} alt="Your signature" className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-ink">This signature goes on your signature line and in the box at the foot of every page.</span>
                    <button type="button" onClick={changeSignature} disabled={pending || previewing} className="w-fit font-medium text-primary hover:underline disabled:opacity-50">
                      Change signature
                    </button>
                  </div>
                </div>
                {previewing && (
                  <p className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
                    <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
                    Putting your signature into the agreement…
                  </p>
                )}
                {preview && !previewing && (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={preview.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink hover:bg-[var(--brand-strong)]"
                        data-esign-open
                      >
                        <FileSignature aria-hidden className="h-3.5 w-3.5" />
                        Open your signed agreement
                        <ExternalLink aria-hidden className="h-3 w-3" />
                      </a>
                      <span className="text-xs text-muted">Read it through before you submit.</span>
                    </div>
                    {/* Shown in place on a wide screen; a phone opens it with the button above. */}
                    <iframe src={preview.url} title="Your signed agreement" className="hidden h-[32rem] w-full rounded-lg border border-border bg-white sm:block" data-esign-frame />
                  </div>
                )}
                {signError && signatureRef && !previewing && (
                  <button type="button" onClick={() => void buildPreview(signatureRef)} className="w-fit text-xs font-medium text-primary hover:underline">
                    Try building it again
                  </button>
                )}
                {esign && <input type="hidden" name="signature" value={signatureRef ?? ""} />}
              </div>
            ))}
          {signError && (
            <p role="alert" className="rounded-md border border-danger bg-danger-bg px-2 py-1 text-xs font-medium text-danger">
              {signError}
            </p>
          )}
        </section>
      )}

      {needsVideo && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-3" data-video-step>
          <h5 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-ink">{needsDocument ? 2 : 1}</span>
            Record the consent video
          </h5>
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
        </section>
      )}

      {/* The native file input is styled out and driven by the label so it
          matches the bordered video picker above it — left bare it renders as
          unboxed "Choose File" text and has an intrinsic min width that pushes
          the submit button onto its own line. The chosen filename sits on the
          row below rather than between the two: at 768px the sidebar leaves
          this card barely 440px, and inline it wrapped the button away from
          the picker it is meant to sit beside. */}
      <div className="flex flex-wrap items-center gap-2">
        {needsDocument && !esign && (
          <label className="cursor-pointer whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg">
            {documentName ? "Change file" : "Choose file(s)"}
            <input
              ref={documentInput}
              type="file"
              multiple
              accept={ACCEPTED_DOCUMENT_ACCEPT}
              className="sr-only"
              disabled={pending || joining}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                // Emptied so the same file can be chosen again, or added to.
                e.target.value = "";
                const add = addingMore.current;
                addingMore.current = false;
                if (picked.length === 0 && add) return;
                joinedDocument.choose(picked, { add });
              }}
              data-agreement-document-input
            />
          </label>
        )}
        {needsDocument && !esign && <input type="hidden" name="agreement" value={documentRef ?? ""} />}
        {/* Gated in the button rather than with `required` on the input: a
            visually-hidden required control can't be focused for the native
            validation bubble, and Chrome then blocks submission silently. */}
        <Button type="submit" variant="primary" size="sm" pending={pending} disabled={!ready} status={{ state, label: "Submitted." }} data-submit-agreement>
          {esign ? "Submit e-signed agreement" : both ? "Submit signed agreement" : needsVideo ? "Submit new video" : "Submit signed agreement"}
        </Button>
      </div>
      {needsDocument && !esign && (
        <>
          <p className="truncate text-xs text-muted">
            {documentName ?? "No file chosen"} · Several pages are joined into one PDF ·{" "}
            <span className="font-semibold text-ink">{limitHint()}</span>
          </p>
          <JoinedFilesList
            joined={joinedDocument}
            disabled={pending || joining}
            onAddMore={() => {
              addingMore.current = true;
              documentInput.current?.click();
            }}
          />
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
          {uploading > 0 || previewing
            ? "One moment — submission unlocks as soon as this is done."
            : needsVideo && needsDocument && !videoRef && !documentReady
              ? esign
                ? "Sign the agreement and record the video — submission stays locked until both are done."
                : "Record the video and attach your signed agreement — submission stays locked until both are here."
              : needsVideo && !videoRef
                ? "Record or attach the video — submission stays locked until then."
                : esign
                  ? "Sign the agreement — submission stays locked until your signed copy is ready."
                  : "Attach your signed agreement — submission stays locked until then."}
        </p>
      )}

      {state && "error" in state && state.error && <p className="text-xs text-danger">{state.error}</p>}

      {showWhy && <WhyVideoDialog onClose={() => setShowWhy(false)} />}
    </form>
  );
}
