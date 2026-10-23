"use client";

import { useState, useTransition } from "react";
import { disconnectSocialAccount } from "@/lib/actions/socialAccounts";
import { Button } from "@/components/ui/Button";

export function DisconnectAccountButton({ accountId, name }: { accountId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="danger"
        size="sm"
        pending={pending}
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Disconnect ${name}? Its stored token is removed.`)) return;
          setError(null);
          start(async () => {
            const result = await disconnectSocialAccount(accountId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        Disconnect
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
