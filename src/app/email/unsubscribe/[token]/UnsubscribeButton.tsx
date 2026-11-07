"use client";

import { unsubscribeFromAll } from "@/lib/actions/emailPreferences";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";

export function UnsubscribeButton({ token, email }: { token: string; email: string }) {
  const run = useButtonAction();
  if (run.state?.success) {
    return <p className="text-sm text-success" data-unsubscribed>Done — {email} is unsubscribed and won&rsquo;t receive HMARK&rsquo;s emails.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Stop all marketing emails to <span className="font-medium text-ink">{email}</span>?
      </p>
      <div>
        <Button variant="danger" pending={run.pending} onClick={() => run.run(() => unsubscribeFromAll(token))} data-unsubscribe-confirm>
          Unsubscribe
        </Button>
      </div>
      {run.state?.error && <p className="text-xs text-danger">{run.state.error}</p>}
    </div>
  );
}
