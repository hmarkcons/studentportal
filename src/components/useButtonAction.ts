"use client";

import { useCallback, useRef, useState } from "react";
import type { ActionResultLike } from "@/lib/actionStatus";
import { toast } from "@/lib/toast";

type Result = { error?: string | null; success?: boolean } | undefined | null | void;

/**
 * For a button that calls a server action from onClick rather than a form.
 *
 * Those buttons had no busy state and no confirmation — the click did its work
 * in silence, and a failure arrived as a browser alert(). This gives them what
 * a form's useActionState gives a submit button:
 *
 *   const del = useButtonAction();
 *   <Button onClick={() => del.run(() => deleteThing(id), { toast: "Deleted." })}
 *           pending={del.pending} status={{ state: del.state, label: "Deleted.", showError: true }} />
 *
 * `toast` is for an action that removes its own button — a deleted row, a
 * submit that moves to another page — where "Deleted." beside the button would
 * be beside nothing. The toast is raised after the action answers, never
 * before, so it cannot claim a success the server then refuses.
 *
 * An action that redirects may never answer at all (the navigation replaces
 * the page before the promise settles). Its caller should pass `toast` anyway:
 * it is shown when the promise does settle, and the new page is the
 * confirmation when it does not.
 */
export function useButtonAction() {
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResultLike>(undefined);
  // A second click while the first is running would run the action twice —
  // two deletes, two emails. The button is disabled while pending, but a
  // double-click can land before the re-render that disables it.
  const running = useRef(false);

  const run = useCallback(
    async (action: () => Promise<Result> | Result, options: { toast?: string } = {}): Promise<Result> => {
      if (running.current) return undefined;
      running.current = true;
      setPending(true);
      setState(undefined);
      try {
        const result = await action();
        if (result && typeof result === "object" && result.error) {
          setState({ error: result.error });
        } else {
          setState({ success: true });
          if (options.toast) toast(options.toast);
        }
        return result;
      } catch (error) {
        // A redirect or notFound() from the action is how Next moves on; let
        // it through untouched. Anything else is a real failure to show.
        const digest = (error as { digest?: unknown })?.digest;
        if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"))) {
          if (options.toast) toast(options.toast);
          throw error;
        }
        // Returned as well as shown, in the same shape as an error the action
        // returned itself — so a caller can tell a failure from a success by
        // `.error` alone, rather than seeing `undefined` for both.
        const message = (error as Error)?.message || "Something went wrong — try again.";
        setState({ error: message });
        return { error: message };
      } finally {
        running.current = false;
        setPending(false);
      }
    },
    []
  );

  return { run, pending, state };
}
