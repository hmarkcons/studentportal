"use client";

import { useActionState } from "react";
import { rotateOfficeQrToken } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";

export function RotateQrButton() {
  const [state, formAction, pending] = useActionState(rotateOfficeQrToken, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" pending={pending} status={{ state, label: "New code generated." }}>
        Regenerate QR code
      </Button>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
