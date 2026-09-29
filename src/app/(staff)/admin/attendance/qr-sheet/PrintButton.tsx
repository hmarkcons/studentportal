"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function PrintButton() {
  return (
    <Button type="button" variant="primary" onClick={() => window.print()}>
      <Printer className="h-4 w-4 shrink-0" aria-hidden />
      Print this sheet
    </Button>
  );
}
