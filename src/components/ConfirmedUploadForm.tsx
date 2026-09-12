"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * An upload that asks before it commits.
 *
 * A document sent in by a student or a university cannot be taken back:
 * neither of them can delete or edit one, and if staff send it back the
 * original stays on the record as the rejected version (0165). That is the
 * right behaviour for a document trail and the wrong thing to discover
 * afterwards, so the file is chosen first and submitted second, with the
 * consequence said plainly in between.
 *
 * Choosing a different file before confirming is free — nothing has been sent
 * until Submit.
 */
export function ConfirmedUploadForm({
  action,
  accept,
  capture,
  submitLabel,
  replacing = false,
  className = "",
  size = "sm",
}: {
  action: (prevState: unknown, formData: FormData) => Promise<{ error?: string; success?: boolean } | void>;
  accept?: string;
  capture?: "environment" | "user";
  /** What the button says before a file is chosen — "Upload", "Replace". */
  submitLabel: string;
  /** True when this replaces something already sent, which is worth saying. */
  replacing?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  // Clear the chosen file once it has gone, so the confirmation does not stay
  // on screen over a document that is already sent.
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setFileName(null);
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          accept={accept}
          capture={capture}
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="max-w-full text-xs"
        />
        {!fileName && (
          <Button type="button" size={size} disabled title="Choose a file first">
            {submitLabel}
          </Button>
        )}
      </div>

      {fileName && (
        <div className="flex flex-col gap-2 rounded-md border border-warning bg-warning-bg p-2">
          <p className="text-xs font-medium text-warning">Send &ldquo;{fileName}&rdquo;?</p>
          <p className="text-xs text-warning">
            Once submitted you cannot change or delete it.{" "}
            {replacing
              ? "The version that was sent back stays on the record as rejected."
              : "If it is sent back, you can upload a replacement and this one stays on the record as rejected."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" size={size} pending={pending}>
              Submit document
            </Button>
            <Button
              type="button"
              variant="ghost"
              size={size}
              onClick={() => {
                setFileName(null);
                formRef.current?.reset();
              }}
            >
              Choose a different file
            </Button>
          </div>
        </div>
      )}

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
