"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ActionResult = { error?: string; success?: boolean } | undefined;

/**
 * Runs a server action from a form without letting React clear the form.
 *
 * React resets a `<form action={fn}>` once the action finishes — including
 * when the action refused the save. For fields that are uncontrolled with a
 * `defaultValue`, that restores each one to whatever the server last sent,
 * which on a half-completed record is empty: a student's passport number,
 * typed once and refused for an unrelated reason, was gone, and the next Save
 * wrote the blank over the record and said "Saved."
 *
 * `onReset` cannot stop it. React does not reset uncontrolled fields by
 * dispatching the cancelable `reset` event — it restores their defaults
 * directly during commit — so preventing the event changes nothing. Verified
 * against production: the guard was deployed and the fields still emptied.
 *
 * So the submit is handled here instead. Nothing resets, the error stays on
 * screen next to the data that produced it, and a successful save refreshes
 * the server components underneath without touching what is on screen.
 */
export function useFormAction(
  action: (prevState: unknown, formData: FormData) => Promise<ActionResult>,
  options: { onSuccess?: () => void; refreshOnSuccess?: boolean } = {}
) {
  const { onSuccess, refreshOnSuccess = true } = options;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read the form before awaiting: currentTarget is null by the time the
    // action resolves.
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setSuccess(false);

    let result: ActionResult;
    try {
      result = await action(undefined, formData);
    } catch (e) {
      // A thrown action — a network drop, a crash — used to surface as a
      // silent no-op with the button stuck mid-save.
      setPending(false);
      setError(e instanceof Error ? e.message : "That didn't save. Check your connection and try again.");
      return;
    }

    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }

    setSuccess(true);
    onSuccess?.();
    // revalidatePath only marks the server cache stale; without this the
    // page around the form keeps showing what it showed before the save.
    if (refreshOnSuccess) router.refresh();
  }

  return { onSubmit, pending, error, success, setError };
}
