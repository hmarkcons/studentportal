"use client";

import { useActionState } from "react";
import { rotateOfficeQrToken } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { ActionStatus } from "@/components/ActionStatus";

export function RotateQrButton() {
  const [state, formAction, pending] = useActionState(rotateOfficeQrToken, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" pending={pending} className="self-start">
        Regenerate QR code
      </Button>
      <ActionStatus state={state} pending={pending} label="New code generated." />
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
