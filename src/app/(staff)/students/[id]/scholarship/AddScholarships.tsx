"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { addStudentScholarships } from "@/lib/actions/scholarships";
import { toast } from "@/lib/toast";

export type OfferedBody = { id: string; name: string; region: string | null; alreadyAdded: boolean };

/**
 * Putting a student forward for several of a country's scholarships at once.
 *
 * Outside Italy a student is usually entered for more than one — Erasmus
 * Mundus alongside the national scheme — and the single-select that was here
 * made that four presses and four reloads for one decision.
 *
 * Only shown once somebody has answered "Yes" to applying for a scholarship
 * on the Dashboard tracker. Until then the question has not been taken, and
 * offering the list would be answering it for them.
 */
export function AddScholarships({
  studentId,
  applicationId,
  revalidateTo,
  bodies,
  countryName,
}: {
  studentId: string;
  applicationId: string;
  revalidateTo: string;
  bodies: OfferedBody[];
  countryName: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const available = bodies.filter((b) => !b.alreadyAdded);
  if (available.length === 0) {
    return (
      <p className="text-xs text-muted">
        Every scholarship on file for {countryName} is already recorded against this student.
      </p>
    );
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMessage(null);
  }

  async function add() {
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await addStudentScholarships(studentId, applicationId, revalidateTo, [...picked]);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    const done = `Added ${result.added} scholarship${result.added === 1 ? "" : "s"}.${
      result.skipped ? ` ${result.skipped} already recorded.` : ""
    }`;
    // Adding every one still available replaces this whole panel with "every
    // scholarship is already recorded", taking the message beside the button
    // with it — so that case says it in a toast as well.
    if (picked.size >= available.length) toast(done);
    setPicked(new Set());
    setMessage(done);
    router.refresh();
  }

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="mb-2 text-xs font-medium text-ink">
        Which {countryName} scholarships is this student being put forward for?
      </p>
      <div className="mb-3 flex flex-col gap-1.5">
        {available.map((b) => (
          <label key={b.id} className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={picked.has(b.id)}
              onChange={() => toggle(b.id)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              {b.name}
              {b.region && <span className="ml-2 text-xs text-muted">{b.region}</span>}
            </span>
          </label>
        ))}
      </div>

      {/* Said rather than left implicit: the ones already on file are not in
          the list above, and their absence should not read as them being
          unavailable. */}
      {bodies.some((b) => b.alreadyAdded) && (
        <p className="mb-2 text-[11px] text-muted">
          Already recorded: {bodies.filter((b) => b.alreadyAdded).map((b) => b.name).join(", ")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" size="sm" pending={pending} disabled={picked.size === 0} onClick={add}>
          Add {picked.size > 0 ? `${picked.size} ` : ""}scholarship{picked.size === 1 ? "" : "s"}
        </Button>
        {message && <Badge tone="success">{message}</Badge>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
