"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clockInOut } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";

export function ClockButtons() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"in" | "out" | null>(null);

  async function handle(action: "in" | "out") {
    setPending(action);
    setError(null);
    const result = await clockInOut(action);
    if (result?.error) setError(result.error);
    else router.refresh();
    setPending(null);
  }

  return (
    <div>
      <div className="flex gap-2">
        <Button onClick={() => handle("in")} variant="primary" pending={pending === "in"}>
          Clock In
        </Button>
        <Button onClick={() => handle("out")} pending={pending === "out"}>
          Clock Out
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
