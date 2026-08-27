"use client";

import { useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { StaffForm } from "./StaffForm";

export function AddStaffButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        + Add Staff
      </Button>
      <SlideOver open={open} onClose={() => setOpen(false)} title="Add Staff">
        <StaffForm onSuccess={() => setOpen(false)} />
      </SlideOver>
    </>
  );
}
