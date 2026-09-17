"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { addBackupPrograms } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import { roundOptionLabel, sortRounds, type ProgramRound } from "@/lib/programRounds";

/**
 * Adds further programmes at this application's university.
 *
 * The office applies to two or three programmes at one university — a first
 * choice and its backups — and the creation form already does that with its
 * "+ Add another program" slots. Afterwards there was no way to add one: you
 * had to return to New application and re-pick the country and university you
 * were already looking at.
 *
 * Each one becomes its own application row, siblings with no ranking, exactly
 * as creation makes them.
 */
export function AddBackupPrograms({
  applicationId,
  studentId,
  universityName,
  available,
  siblings,
  today,
}: {
  applicationId: string;
  studentId: string;
  universityName: string;
  /** Programmes at this university the student has not applied for. */
  available: { id: string; name: string; rounds?: ProgramRound[] }[];
  /** The other programmes already on file at this university. */
  siblings: { id: string; name: string | null }[];
  /** Karachi's today, so a closed round is labelled on the business day. */
  today?: string;
}) {
  const action = addBackupPrograms.bind(null, applicationId, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  // Each slot carries its programme and that programme's intake round as one
  // pair, so the two cannot drift apart.
  const [slots, setSlots] = useState<{ programId: string; roundId: string }[]>([{ programId: "", roundId: "" }]);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {/* What is already on file, so nobody adds a second application for a
          programme this student is already applying to. */}
      {siblings.length > 0 && (
        <p className="text-xs text-muted">
          Also applying at {universityName}:{" "}
          {siblings.map((sib, i) => (
            <span key={sib.id}>
              {i > 0 && ", "}
              <Link href={`/students/${studentId}/applications/${sib.id}`} className="text-primary hover:underline">
                {sib.name ?? "no programme chosen"}
              </Link>
            </span>
          ))}
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start text-xs font-medium text-primary hover:underline"
          disabled={available.length === 0}
        >
          + Add backup programme
        </button>
      ) : (
        <form action={formAction} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted">
            Another programme at {universityName}. Each one becomes its own application, starting at the beginning of the
            pipeline, and inherits this one&rsquo;s intake and deadline — both editable afterwards.
          </p>
          {slots.map((slot, i) => {
            const chosen = available.find((p) => p.id === slot.programId) ?? null;
            const rounds = sortRounds(chosen?.rounds ?? []);
            const takenIds = slots.map((s) => s.programId);
            return (
              <div key={i} className="flex flex-col gap-1">
                {/* Submitted as hidden inputs rather than by naming the
                    selects: a controlled <select> whose value is in none of
                    its options submits nothing, which would shorten one list
                    and pair a round with the wrong programme. */}
                <input type="hidden" name="program_ids" value={slot.programId} />
                <input type="hidden" name="round_ids" value={slot.roundId} />
                <Select
                  value={slot.programId}
                  onChange={(e) =>
                    setSlots((prev) =>
                      // The round goes with the programme it belonged to.
                      prev.map((s, idx) => (idx === i ? { programId: e.target.value, roundId: "" } : s))
                    )
                  }
                >
                  <option value="">Programme {i + 1}…</option>
                  {available
                    // Keeps one slot from offering what another slot has taken.
                    .filter((p) => p.id === slot.programId || !takenIds.includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
                {rounds.length > 0 && (
                  <Select
                    value={slot.roundId}
                    onChange={(e) =>
                      setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, roundId: e.target.value } : s)))
                    }
                    className="text-xs"
                  >
                    <option value="">No specific round yet</option>
                    {rounds.map((r) => (
                      <option key={r.id} value={r.id ?? ""}>
                        {roundOptionLabel(r, today)}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            );
          })}
          {slots.length < available.length && (
            <button
              type="button"
              onClick={() => setSlots((prev) => [...prev, { programId: "", roundId: "" }])}
              className="self-start text-xs font-medium text-primary hover:underline"
            >
              + Another one
            </button>
          )}
          {state?.error && <p className="text-xs text-danger">{state.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" size="sm" pending={pending} disabled={!slots.some((s) => s.programId)}>
              Add
            </Button>
            <ActionStatus state={state} pending={pending} label="Added." />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                setSlots([{ programId: "", roundId: "" }]);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {available.length === 0 && siblings.length > 0 && (
        <p className="text-xs text-muted">Every programme on file at {universityName} already has an application.</p>
      )}
    </div>
  );
}
