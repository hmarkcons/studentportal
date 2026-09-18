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
  /**
   * Programmes at this university with at least one round slot still free.
   * Since 0234 a programme is not taken outright — the same programme in a
   * different round is a separate application — so each entry carries only
   * the rounds still available, and whether the "no specific round" slot is
   * still free.
   */
  available: { id: string; name: string; rounds: ProgramRound[]; allowNoRound: boolean }[];
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
            pipeline, and inherits this one&rsquo;s intake and deadline — both editable afterwards. The same programme in a
            different intake round counts as its own application, so a second attempt can be added here too.
          </p>
          {slots.map((slot, i) => {
            const chosen = available.find((p) => p.id === slot.programId) ?? null;

            // A programme may now legitimately appear in two slots, in two
            // different rounds — so slots no longer exclude each other by
            // programme. What they exclude is a round another slot has already
            // taken for that same programme.
            const roundsUsedInOtherSlots = slots
              .filter((s, idx) => idx !== i && s.programId === slot.programId)
              .map((s) => s.roundId);
            const rounds = sortRounds(chosen?.rounds ?? []).filter(
              (r) => !roundsUsedInOtherSlots.includes(r.id ?? "")
            );
            // "No specific round" is a slot of its own in the unique key, so it
            // can be used up too — by an existing application or by a sibling
            // slot in this same submit.
            const noRoundFree = Boolean(chosen?.allowNoRound) && !roundsUsedInOtherSlots.includes("");

            return (
              <div key={i} className="flex flex-col gap-1">
                {/* Submitted as hidden inputs rather than by naming the
                    selects: a controlled <select> whose value is in none of
                    its options submits nothing, which would shorten one list
                    and pair a round with the wrong programme. */}
                <input type="hidden" name="program_ids" value={slot.programId} />
                <input type="hidden" name="round_ids" value={slot.roundId} />
                <Select
                  aria-label={`Backup programme ${i + 1}`}
                  value={slot.programId}
                  onChange={(e) => {
                    const next = available.find((p) => p.id === e.target.value) ?? null;
                    // Where "no specific round" is already used up, a round has
                    // to be chosen — so it defaults to the first free one
                    // rather than to an option that cannot be submitted.
                    const firstFree = next && !next.allowNoRound ? next.rounds[0]?.id ?? "" : "";
                    setSlots((prev) =>
                      prev.map((s, idx) => (idx === i ? { programId: e.target.value, roundId: firstFree } : s))
                    );
                  }}
                >
                  <option value="">Programme {i + 1}…</option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                {rounds.length > 0 && (
                  <Select
                    aria-label={`Intake round for backup programme ${i + 1}`}
                    value={slot.roundId}
                    onChange={(e) =>
                      setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, roundId: e.target.value } : s)))
                    }
                    className="text-xs"
                  >
                    {noRoundFree && <option value="">No specific round yet</option>}
                    {rounds.map((r) => (
                      <option key={r.id} value={r.id ?? ""}>
                        {roundOptionLabel(r, today)}
                      </option>
                    ))}
                  </Select>
                )}
                {chosen && rounds.length === 0 && !noRoundFree && (
                  <p className="text-xs text-warning">
                    Every round of {chosen.name} is already applied for in this intake.
                  </p>
                )}
              </div>
            );
          })}
          {/* Capacity is the number of free round slots, not the number of
              programmes — one programme with three free rounds is three
              addable applications. */}
          {slots.length < available.reduce((n, p) => n + p.rounds.length + (p.allowNoRound ? 1 : 0), 0) && (
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
