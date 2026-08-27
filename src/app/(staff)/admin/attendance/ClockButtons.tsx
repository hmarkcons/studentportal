"use client";

import { clockInOut } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";

export function ClockButtons() {
  return (
    <div className="flex gap-2">
      <Button onClick={() => clockInOut("in")} variant="primary">
        Clock In
      </Button>
      <Button onClick={() => clockInOut("out")}>
        Clock Out
      </Button>
    </div>
  );
}
