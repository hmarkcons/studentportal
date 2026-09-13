"use client";

import { Button } from "@/components/ui/Button";

export function PrintButton() {
  return (
    <Button type="button" variant="primary" onClick={() => window.print()}>
      🖨️ Print this sheet
    </Button>
  );
}
