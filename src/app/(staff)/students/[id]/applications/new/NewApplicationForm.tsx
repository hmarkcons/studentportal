"use client";

import { useActionState, useMemo, useState } from "react";
import { createApplication } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { IntakeField } from "@/components/IntakeField";
import { intakeConfigFor, type DestinationOption } from "@/app/(staff)/students/new/RegisterStudentForm";
import { toast } from "@/lib/toast";
import { ProgramDates } from "@/components/ProgramDates";
import { roundOptionLabel, sortRounds, type ProgramRound } from "@/lib/programRounds";

type Destination = DestinationOption;
type University = { id: string; name: string; destination_id: string };
type Program = {
  id: string;
  university_id: string;
  name: string;
  level: string;
  core_field: string | null;
  field_group: string | null;
  rounds: ProgramRound[];
};

export function NewApplicationForm({
  studentId,
  destinations,
  universities,
  programs,
  fieldGroups,
  studentFieldGroups,
  today,
}: {
  studentId: string;
  destinations: Destination[];
  universities: University[];
  programs: Program[];
  /** The field taxonomy, for the finder's field chips. */
  fieldGroups: { slug: string; name: string }[];
  /**
   * The broad fields this student chose on their profile. Offered as a
   * one-click preset, so the commonest search — "what does this university
   * have in the fields they actually asked for" — is one button rather than
   * hunting for the same fields by eye every time.
   */
  studentFieldGroups: string[];
  /** Karachi's today, so "applications closed" is judged on the business day. */
  today?: string;
}) {
  const create = createApplication.bind(null, studentId);
  // A created application redirects to its own page, taking this button with
  // it — so it is confirmed with a toast, raised only once the server has
  // answered (the redirect is how it answers success).
  const action = async (prevState: unknown, formData: FormData) => {
    try {
      const result = await create(prevState, formData);
      if (!result?.error) toast("Application added.");
      return result;
    } catch (error) {
      const digest = (error as { digest?: unknown })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) toast("Application added.");
      throw error;
    }
  };
  const [state, formAction, pending] = useActionState(action, undefined);
  const [destinationId, setDestinationId] = useState("");
  const [universityId, setUniversityId] = useState("");
  // One slot per programme being applied for, each carrying its own intake
  // round. Kept as one array of pairs rather than two parallel arrays, so a
  // programme and its round cannot drift out of step.
  const [slots, setSlots] = useState<{ programId: string; roundId: string }[]>([{ programId: "", roundId: "" }]);

  // Changing the university invalidates every programme already chosen. This
  // used to leave them in state: the <Select> showed blank because the old id
  // matched none of the new options, but the id was still there and was still
  // submitted, filing an application against a programme from the university
  // the user had just navigated away from.
  function chooseUniversity(id: string) {
    setUniversityId(id);
    setSlots([{ programId: "", roundId: "" }]);
  }

  const filteredUniversities = useMemo(
    () => universities.filter((u) => !destinationId || u.destination_id === destinationId),
    [universities, destinationId]
  );
  // ------------------------------------------------------------- the finder
  //
  // A university can offer hundreds of programmes — Germany's catalogue runs to
  // 421 across its universities — so picking one from a bare dropdown means
  // reading the whole list. These three narrow it: the level the student is
  // applying at, the field they want, and free text over the programme name
  // and its field.
  //
  // Filtering happens here rather than on the server because these rows are
  // already loaded for the picker; re-querying per keystroke would be slower
  // and no more correct.
  const [findLevel, setFindLevel] = useState("");
  // Several fields, not one. A student's interests routinely span more than a
  // single field — the three on file ask for things like
  // "Mechanical/Mechatronics/Robotics/Industrial/Energy Engineering" — so a
  // one-field filter forces staff to search the same university repeatedly and
  // hold the union in their head. Selecting more fields BROADENS the result,
  // which is the opposite of how the level and text filters narrow it.
  const [findFields, setFindFields] = useState<Set<string>>(new Set());
  const [findText, setFindText] = useState("");

  const universityPrograms = useMemo(
    () => programs.filter((p) => p.university_id === universityId),
    [programs, universityId]
  );

  // Only the fields this university actually offers, so the dropdown never
  // presents a choice that yields nothing.
  const availableFields = useMemo(() => {
    const present = new Set(universityPrograms.map((p) => p.field_group).filter(Boolean));
    return fieldGroups.filter((g) => present.has(g.slug));
  }, [universityPrograms, fieldGroups]);

  const filteredPrograms = useMemo(() => {
    const needle = findText.trim().toLowerCase();
    return universityPrograms.filter((p) => {
      if (findLevel && p.level !== findLevel) return false;
      // Any of the chosen fields, not all of them: the fields are alternatives,
      // and requiring a programme to be in several at once would return
      // nothing every time more than one was picked.
      if (findFields.size > 0 && !(p.field_group && findFields.has(p.field_group))) return false;
      if (needle) {
        const haystack = `${p.name} ${p.core_field ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [universityPrograms, findLevel, findFields, findText]);

  const narrowed = findLevel !== "" || findFields.size > 0 || findText.trim() !== "";

  // Counts per field, so staff can see what picking one would add before
  // picking it — and so a field offering nothing at this level is visibly
  // empty rather than a dead click.
  const countByField = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of universityPrograms) {
      if (!p.field_group) continue;
      if (findLevel && p.level !== findLevel) continue;
      counts.set(p.field_group, (counts.get(p.field_group) ?? 0) + 1);
    }
    return counts;
  }, [universityPrograms, findLevel]);

  function toggleField(slug: string) {
    setFindFields((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  /** The student's own interests, where this university teaches them. */
  const interestFields = useMemo(
    () => availableFields.filter((g) => studentFieldGroups.includes(g.slug)),
    [availableFields, studentFieldGroups]
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Country</label>
        {/* The visible <label> above is not associated with this select — it
            has no htmlFor and the select has no id — and the select carries no
            name either, since the destination only drives the filtering. So it
            announced as an unlabelled combobox. */}
        <Select
          aria-label="Country"
          required
          value={destinationId}
          onChange={(e) => {
            setDestinationId(e.target.value);
            chooseUniversity("");
          }}
        >
          <option value="">Choose…</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </Select>
        {destinations.length === 0 && (
          <p className="text-xs text-danger">This student isn&apos;t registered for any destination yet.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">University</label>
        <Select
          aria-label="University"
          name="university_id"
          required
          value={universityId}
          onChange={(e) => chooseUniversity(e.target.value)}
        >
          <option value="">Choose…</option>
          {filteredUniversities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </div>
      {/* Shown once a university is chosen: before that there is nothing to
          narrow, and an empty finder above an empty list is just clutter. */}
      {universityId && universityPrograms.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-bg p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5 text-[11px] text-muted">
              Level
              <Select
                aria-label="Filter by level"
                value={findLevel}
                onChange={(e) => setFindLevel(e.target.value)}
                className="w-32"
              >
                <option value="">Any</option>
                {["bachelors", "masters", "phd"]
                  .filter((l) => universityPrograms.some((p) => p.level === l))
                  .map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="flex flex-1 flex-col gap-0.5 text-[11px] text-muted">
              Search
              <Input
                aria-label="Search programmes"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="Programme name or field…"
                className="min-w-[180px]"
              />
            </label>
            {narrowed && (
              <button
                type="button"
                onClick={() => {
                  setFindLevel("");
                  setFindFields(new Set());
                  setFindText("");
                }}
                className="pb-1.5 text-xs text-muted hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>

          {/* Fields as toggles rather than a dropdown, because several can be
              on at once and a multi-select dropdown hides what is selected
              behind a closed control. Each carries its count at the current
              level, so picking one is never a dead click. */}
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">Fields</span>
              {interestFields.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFindFields(new Set(interestFields.map((g) => g.slug)))}
                  className="rounded-full border border-primary px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                >
                  Their course of interest ({interestFields.length})
                </button>
              )}
              {findFields.size > 0 && (
                <button
                  type="button"
                  onClick={() => setFindFields(new Set())}
                  className="text-[11px] text-muted hover:text-ink"
                >
                  any field
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {availableFields.map((g) => {
                const on = findFields.has(g.slug);
                const count = countByField.get(g.slug) ?? 0;
                return (
                  <button
                    key={g.slug}
                    type="button"
                    aria-pressed={on}
                    aria-label={`Field: ${g.name}`}
                    onClick={() => toggleField(g.slug)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      on
                        ? "border-primary bg-primary text-primary-ink"
                        : count === 0
                          ? "border-border text-muted opacity-50"
                          : "border-border text-ink hover:border-primary"
                    }`}
                  >
                    {g.name}
                    <span className={on ? "ml-1 opacity-80" : "ml-1 text-muted"}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-muted">
            {narrowed
              ? `${filteredPrograms.length} of ${universityPrograms.length} programmes match.`
              : `${universityPrograms.length} programme${universityPrograms.length === 1 ? "" : "s"} at this university.`}
            {narrowed && filteredPrograms.length === 0 && " Widen the filters to see more."}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink">Programs</label>
        {slots.map((slot, i) => {
          const chosen = programs.find((p) => p.id === slot.programId) ?? null;

          // The same programme may appear in two slots, in two different
          // rounds — that is one application each. What cannot repeat is the
          // pair, so a round another slot has taken for this same programme is
          // left out rather than accepted and then refused on submit.
          const usedInOtherSlots = slots
            .filter((s, idx) => idx !== i && s.programId === slot.programId)
            .map((s) => s.roundId);
          const rounds = sortRounds(chosen?.rounds ?? []).filter((r) => !usedInOtherSlots.includes(r.id ?? ""));
          const noRoundFree = !usedInOtherSlots.includes("");
          return (
            <div key={i} className="flex flex-col gap-0.5">
              {/* The values are submitted as hidden inputs, not by naming the
                  selects. A controlled <select> whose value matches none of
                  its options submits nothing at all, which would shorten one
                  of the two lists and pair a round with the wrong programme —
                  the lists are read back by index. */}
              <input type="hidden" name="program_ids" value={slot.programId} />
              <input type="hidden" name="round_ids" value={slot.roundId} />
              {/* One "Programs" label sits above every slot, so each control
                  names itself — otherwise a screen reader reads four selects
                  all called "Programs". */}
              <Select
                aria-label={`Programme ${i + 1}`}
                value={slot.programId}
                onChange={(e) => {
                  // Where another slot already holds this programme with no
                  // round, the free option is a round — so default to the
                  // first one rather than to a pair that cannot be submitted.
                  const alreadyNoRound = slots.some(
                    (s, idx) => idx !== i && s.programId === e.target.value && s.roundId === ""
                  );
                  const next = programs.find((p) => p.id === e.target.value) ?? null;
                  const usedHere = slots
                    .filter((s, idx) => idx !== i && s.programId === e.target.value)
                    .map((s) => s.roundId);
                  const firstFree = alreadyNoRound
                    ? sortRounds(next?.rounds ?? []).find((r) => !usedHere.includes(r.id ?? ""))?.id ?? ""
                    : "";
                  setSlots((prev) =>
                    // The round is cleared with the programme: a round belongs
                    // to one programme, so keeping it would point at another.
                    prev.map((s, idx) => (idx === i ? { programId: e.target.value, roundId: firstFree } : s))
                  );
                }}
              >
                <option value="">Program {i + 1}…</option>
                {filteredPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {rounds.length > 0 && (
                <Select
                  aria-label={`Intake round for programme ${i + 1}`}
                  value={slot.roundId}
                  onChange={(e) =>
                    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, roundId: e.target.value } : s)))
                  }
                  className="text-xs"
                >
                  {/* Optional: staff often add the application before the round
                      is settled, and forcing a guess would put a wrong date
                      into the reminder cron. Withheld only when another slot
                      already holds this programme with no round, since that is
                      a slot in the unique key like any other. */}
                  {noRoundFree && <option value="">No specific round yet</option>}
                  {rounds.map((r) => (
                    <option key={r.id} value={r.id ?? ""}>
                      {roundOptionLabel(r, today)}
                    </option>
                  ))}
                </Select>
              )}
              {/* The catalogue's own dates for whatever was just picked, so
                  the Deadline box below is filled in knowing them rather than
                  from memory. Every round is listed, not just the open one —
                  a closed Round 1 above an open Round 2 is exactly what the
                  person needs to see. Renders nothing where the programme has
                  no dates at all. */}
              {chosen && <ProgramDates rounds={chosen.rounds} today={today} showAll className="pl-1" />}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setSlots((prev) => [...prev, { programId: "", roundId: "" }])}
          className="self-start text-xs font-medium text-primary hover:underline"
        >
          + Add another program
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Intake</label>
          {/* The application already knows its destination, so the intake
              field is exactly the one that country uses. */}
          <IntakeField config={intakeConfigFor(destinations, destinationId)} label="" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Deadline</label>
          <Input name="deadline" type="date" />
        </div>
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Application added." }}>
        Create application
      </Button>
    </form>
  );
}
