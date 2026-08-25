"use client";

import { partnerDeleteProgram } from "@/lib/actions/partner";

export function DeleteProgramButton({ id }: { id: string }) {
  return (
    <button onClick={() => partnerDeleteProgram(id)} className="text-xs text-danger hover:underline">
      Delete
    </button>
  );
}
