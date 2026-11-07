"use client";

import { useActionState } from "react";
import { savePreferences, unsubscribeFromAll } from "@/lib/actions/emailPreferences";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";

export function PreferencesForm({
  token,
  email,
  status,
  topics,
  chosen,
}: {
  token: string;
  email: string;
  status: string;
  topics: { key: string; label: string }[];
  /** Empty means every topic. */
  chosen: string[];
}) {
  const [state, action, pending] = useActionState(savePreferences.bind(null, token), undefined);
  const leave = useButtonAction();
  const left = Boolean(leave.state?.success);
  const unsubscribed = status === "unsubscribed" || left;
  const blocked = status === "complained" || status === "bounced" || status === "invalid";

  if (blocked) {
    return <p className="text-sm text-muted">Emails can&rsquo;t be sent to {email} at the moment. Contact HMARK Consultants if you would like that changed.</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-email-preferences>
      <p className="text-sm text-muted">
        For <span className="font-medium text-ink">{email}</span>.{" "}
        {unsubscribed ? "You are unsubscribed from all HMARK emails. Choose topics below to subscribe again." : "Choose what you would like to hear about."}
      </p>
      <form action={action} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          {topics.map((t) => (
            <label key={t.key} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="topic" value={t.key} defaultChecked={unsubscribed ? false : chosen.length === 0 || chosen.includes(t.key)} />
              {t.label}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" pending={pending}>
            {unsubscribed ? "Subscribe again" : "Save my choices"}
          </Button>
          {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
          {state && "success" in state && <p className="text-xs text-success">{state.message}</p>}
        </div>
      </form>
      {!unsubscribed && (
        <div className="border-t border-border pt-4">
          <Button
            type="button"
            variant="danger"
            size="sm"
            pending={leave.pending}
            onClick={() => leave.run(() => unsubscribeFromAll(token))}
            data-unsubscribe-all
          >
            Unsubscribe from all emails
          </Button>
        </div>
      )}
      {left && <p className="text-xs text-success">You are unsubscribed and won&rsquo;t receive HMARK&rsquo;s emails.</p>}
      {leave.state?.error && <p className="text-xs text-danger">{leave.state.error}</p>}
    </div>
  );
}
