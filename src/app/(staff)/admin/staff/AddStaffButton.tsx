"use client";

import { useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { StaffForm } from "./StaffForm";

export function AddStaffButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
        + Add Staff
      </button>
      <SlideOver open={open} onClose={() => setOpen(false)} title="Add Staff">
        <StaffForm onSuccess={() => setOpen(false)} />
      </SlideOver>
    </>
  );
}
