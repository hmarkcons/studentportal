"use client";

import { useActionState } from "react";
import { rotateOfficeQrToken } from "@/lib/actions/admin";

export function RotateQrButton() {
  const [state, formAction, pending] = useActionState(rotateOfficeQrToken, undefined);

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md border border-border px-3 py-1.5 text-sm text-ink hover:bg-bg disabled:opacity-50"
      >
        {pending ? "Regenerating…" : "Regenerate QR code"}
      </button>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
