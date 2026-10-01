"use client";

import { useActionState, useId, useState } from "react";
import { addProgram } from "@/lib/actions/universities";
import { EMAILS_MAX, LEVEL_MAX, STANDARD_LEVELS } from "@/lib/catalogueText";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ProgramRoundsFields } from "@/components/ProgramRoundsFields";
import { FeeInput } from "@/components/FeeInput";

export function AddProgramForm({
  universityId,
  defaultCurrency = "EUR",
  levelOptions = STANDARD_LEVELS,
}: {
  universityId: string;
  defaultCurrency?: string;
  /** Suggested in the level box: the three, and any others this university already uses. Anything may be typed. */
  levelOptions?: readonly string[];
}) {
  const action = addProgram.bind(null, universityId);
  const levelsId = useId();
  const [state, formAction, pending] = useActionState(action, undefined);

  // The rounds widget holds its rows in state, so React's form reset does not
  // clear them the way it clears the plain inputs. On this form that would
  // carry the programme just added over to the next one — remounting it on
  // success empties it to match the rest of the form.
  //
  // Adjusted during render rather than in an effect. useActionState hands back
  // a new object per submission, so comparing against the last one seen makes
  // this run exactly once per result; React then re-renders immediately
  // without committing the discarded output, where an effect would have
  // painted the stale widget first and cleared it on a second pass.
  const [handledState, setHandledState] = useState(state);
  const [roundsKey, setRoundsKey] = useState(0);
  if (handledState !== state) {
    setHandledState(state);
    if (state?.success) setRoundsKey((k) => k + 1);
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <datalist id={levelsId}>
        {levelOptions.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <Input name="level" list={levelsId} required maxLength={LEVEL_MAX} placeholder="Level" aria-label="Level" className="w-36" />
      <Input name="name" placeholder="Program name" required className="min-w-[200px] flex-1" />
      <Input name="core_field" placeholder="Core field" />
      <Input name="sub_field" placeholder="Sub-field" />
      <Input name="tuition_fee" type="text" maxLength={500} placeholder="Tuition, e.g. 3000, 4500" aria-label="Tuition fee" className="w-44" />
      {/* Left blank, the programme charges the university's fee. */}
      <FeeInput compact amount={null} currency={defaultCurrency} />
      <Input name="coordinator_email" type="text" maxLength={EMAILS_MAX} placeholder="Coordinator email(s)" aria-label="Coordinator email" />
      {/* Labelled, because bare date boxes side by side are guesswork — and a
          course start and an apply-by date are easy to enter the wrong way
          round. */}
      <ProgramRoundsFields key={roundsKey} />
      <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Programme added." }}>
        Add program
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
