"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ActionResult = { error?: string; success?: boolean } | undefined;

/**
 * A form in a slide-over that closes itself once the server accepts it.
 *
 * Not useActionState + an effect: closing a panel from an effect that watches
 * the returned state is a setState-in-effect cascade, and the lint rule that
 * catches it is right — the close belongs in the submit, where it is one
 * thing happening after another rather than a render reacting to a render.
 *
 * router.refresh() because everything these forms change is server-rendered:
 * revalidatePath only marks the cache stale, so without it the table behind
 * the panel keeps showing what it showed before the save.
 */
export function useSlideOverForm(
  action: (prevState: unknown, formData: FormData) => Promise<ActionResult>,
  onDone: () => void
) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read the form before awaiting — currentTarget is gone by the time the
    // action resolves.
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await action(undefined, formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onDone();
    router.refresh();
  }

  return { onSubmit, pending, error };
}
