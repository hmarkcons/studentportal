"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MAX_VIDEO_SECONDS, ACCEPTED_VIDEO_ACCEPT, validateVideoFile } from "@/lib/documentUpload";

type Mode = "idle" | "recording" | "review";

// Records a short consent clip in the browser, falling back to picking a
// video file where the camera is blocked or MediaRecorder is unsupported
// (older iOS Safari, locked-down devices). Either way the result is handed
// back to the parent as a File, so submission is identical.
export function ConsentVideoRecorder({ onVideo, disabled }: { onVideo: (file: File | null) => void; disabled?: boolean }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Release the camera and any object URL if the student navigates away
  // mid-recording rather than leaving the light on.
  useEffect(() => {
    return () => {
      cleanupStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function startRecording() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record video — use “Choose a video file” instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }
      chunksRef.current = [];
      // Ask for a plain container. Left to itself the recorder reports types
      // like "video/webm;codecs=vp8,opus", and those codec parameters travel
      // into the uploaded file's content type.
      const preferred = ["video/webm", "video/mp4"].find(
        (t) => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(t)
      );
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const rawType = recorder.mimeType || "video/webm";
        const baseType = rawType.split(";")[0].trim() || "video/webm";
        const ext = baseType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type: baseType });
        const file = new File([blob], `consent-${Date.now()}.${ext}`, { type: baseType });
        cleanupStream();
        if (videoRef.current) videoRef.current.srcObject = null;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setMode("review");
        onVideo(file);
      };
      recorder.start();
      setMode("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_VIDEO_SECONDS) stopRecording();
          return next;
        });
      }, 1000);
    } catch {
      setError("Couldn't access the camera. Allow camera access, or use “Choose a video file” instead.");
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSeconds(0);
    setMode("idle");
    onVideo(null);
  }

  function pickFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    const invalid = validateVideoFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setMode("review");
    onVideo(file);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      {(mode === "recording" || mode === "review") && (
        <video
          ref={videoRef}
          src={mode === "review" ? previewUrl ?? undefined : undefined}
          controls={mode === "review"}
          playsInline
          className="w-full max-w-sm rounded-md bg-black"
        />
      )}

      {mode === "idle" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" size="sm" onClick={startRecording} disabled={disabled}>
            ● Record video
          </Button>
          <span className="text-xs text-muted">or</span>
          <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg">
            Choose a video file
            <input
              type="file"
              accept={ACCEPTED_VIDEO_ACCEPT}
              className="sr-only"
              disabled={disabled}
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </label>
          <span className="text-xs text-muted">Up to {MAX_VIDEO_SECONDS} seconds</span>
        </div>
      )}

      {mode === "recording" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-danger">
            ● Recording — {seconds}s / {MAX_VIDEO_SECONDS}s
          </span>
          <Button type="button" variant="outline" size="sm" onClick={stopRecording}>
            Stop
          </Button>
        </div>
      )}

      {mode === "review" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-success">✓ Video ready</span>
          <Button type="button" variant="outline" size="sm" onClick={reset} disabled={disabled}>
            Re-record
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
