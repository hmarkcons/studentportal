"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { restoreEmailAddress, suppressEmailAddresses } from "@/lib/actions/emailAudience";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function SuppressForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(suppressEmailAddresses, undefined);
  useEffect(() => {
    if (state && "success" in state) router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="flex flex-col gap-2" data-suppress-form>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email addresses — one per line, or separated by commas
        <Textarea name="emails" rows={3} required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Why
        <Input name="reason" required maxLength={200} placeholder="e.g. Asked not to be emailed, by phone" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="danger" pending={pending}>
          Add to the do-not-email list
        </Button>
        {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
        {state && "success" in state && <p className="text-xs text-success">{state.message}</p>}
      </div>
    </form>
  );
}

export function RestoreAddressButton({ email }: { email: string }) {
  const router = useRouter();
  const run = useButtonAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      pending={run.pending}
      status={{ state: run.state, label: "Restored.", showError: true }}
      onClick={async () => {
        if (!confirm(`Take ${email} off the do-not-email list? Campaigns will reach it again.`)) return;
        const r = await run.run(() => restoreEmailAddress(email));
        if (r && "success" in r) router.refresh();
      }}
    >
      Take off
    </Button>
  );
}
