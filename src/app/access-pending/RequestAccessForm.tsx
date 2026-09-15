"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { requestOffsiteAccess } from "@/lib/actions/officeAccess";

/**
 * Asking for permission to work from here.
 *
 * A reason, because the person deciding is being asked to make an exception
 * and "Imran is in Lahore for his sister's wedding" is a decision they can
 * make from their phone. Optional, because somebody locked out at eight in
 * the morning should not be stopped by a form field.
 */
export function RequestAccessForm() {
  const [state, formAction, pending] = useActionState(requestOffsiteAccess, undefined);

  if (state?.success) {
    return (
      <div className="rounded-md border border-success bg-success-bg px-4 py-3">
        <p className="text-sm font-medium text-success">Your request has been sent.</p>
        <p className="mt-1 text-xs text-success">
          Management and the Super Admin can see it now. Once somebody approves it, reload this page and you will be
          straight back in.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Why you need access from here (optional)
        <Textarea
          name="reason"
          rows={3}
          maxLength={500}
          placeholder="e.g. Working from home today — need to send the Milan offer letters."
        />
      </label>
      <Button type="submit" variant="primary" pending={pending} className="self-start">
        Ask for access
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
