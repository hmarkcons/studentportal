"use client";

import { useActionState } from "react";
import { markStaffCommissionPaid } from "@/lib/actions/finance";

export function MarkPaidForm({ id }: { id: string }) {
  const action = markStaffCommissionPaid.bind(null, id, "/finance/commissions");
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="file" name="file" className="text-xs" />
      <button type="submit" disabled={pending} className="rounded-md border border-success px-2 py-1 text-xs text-success disabled:opacity-50">
        Mark paid
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
