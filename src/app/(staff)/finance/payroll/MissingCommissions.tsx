"use client";

import { useState } from "react";
import { addMissingCommissionsForMonth } from "@/lib/actions/commissionAuto";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export type MissingCommission = {
  studentId: string;
  studentName: string;
  registeredOn: string | null;
  /** The amount it would be, or null with a reason it cannot be worked out. */
  amount: number | null;
  currency: string | null;
  reason: string | null;
};

/**
 * Registered students this month with nothing in the commission ledger.
 *
 * A commission is created the moment a student is registered, and again when
 * their agreement is signed — but not every student can be priced at either
 * moment, and students registered before any of that existed have nothing at
 * all. Those would otherwise be invisible: the ledger can only show rows that
 * exist, so a missing commission looked exactly like no commission being due.
 */
export function MissingCommissions({
  staffId,
  month,
  revalidateTo,
  missing,
  canManage,
  currencySymbol,
}: {
  staffId: string;
  month: string;
  revalidateTo: string;
  missing: MissingCommission[];
  canManage: boolean;
  currencySymbol: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  if (missing.length === 0) return null;

  const priceable = missing.filter((m) => m.amount != null);

  async function addAll() {
    setPending(true);
    setError(null);
    const result = await addMissingCommissionsForMonth(staffId, month, revalidateTo);
    if (result?.error) setError(result.error);
    else setAdded(result?.added ?? 0);
    setPending(false);
  }

  return (
    <Card className="mb-6 border-warning">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">
          Not in the commission ledger yet
          <span className="ml-2 font-normal text-muted">
            {missing.length} registered {missing.length === 1 ? "student" : "students"}
          </span>
        </h3>
        {canManage && priceable.length > 0 && (
          <Button type="button" size="sm" variant="primary" pending={pending} onClick={addAll}>
            Add {priceable.length === missing.length ? "all" : `the ${priceable.length} that can be priced`}
          </Button>
        )}
      </div>

      <div className="flex flex-col divide-y divide-border">
        {missing.map((m) => (
          <div key={m.studentId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0">
              <span className="text-ink">{m.studentName}</span>
              {m.registeredOn && <span className="text-muted"> · registered {m.registeredOn}</span>}
            </span>
            {m.amount != null ? (
              <span className="tabular-nums text-ink">
                {m.currency ?? currencySymbol} {m.amount.toLocaleString("en-US")}
              </span>
            ) : (
              // The reason, not a blank: "not in the ledger" and "cannot be
              // priced until the agreement is signed" need different actions.
              <Badge tone="warning">{m.reason ?? "Cannot be worked out"}</Badge>
            )}
          </div>
        ))}
      </div>

      {added !== null && (
        <p className="mt-2 text-xs text-success">
          Added {added} {added === 1 ? "commission" : "commissions"}.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {!canManage && <p className="mt-2 text-xs text-muted">Only Finance or Super Admin can add commission records.</p>}
    </Card>
  );
}
