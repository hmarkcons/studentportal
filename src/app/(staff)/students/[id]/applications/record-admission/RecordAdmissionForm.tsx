"use client";

import { useActionState, useState } from "react";
import { recordExistingAdmission } from "@/lib/actions/visaOnly";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";

export function RecordAdmissionForm({
  studentId,
  destinations,
  universities,
  programs,
  defaultIntake,
}: {
  studentId: string;
  destinations: { id: string; name: string }[];
  universities: { id: string; name: string; destinationId: string }[];
  programs: { id: string; university_id: string; name: string; level: string }[];
  defaultIntake: string;
}) {
  const action = recordExistingAdmission.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [universityId, setUniversityId] = useState("");
  const [letterReady, setLetterReady] = useState(false);
  const theirs = programs.filter((p) => p.university_id === universityId);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3" data-record-admission-form>
      <label className="flex flex-col gap-1 text-xs text-muted">
        University they are admitted to
        <Select name="university_id" value={universityId} onChange={(e) => setUniversityId(e.target.value)} required>
          <option value="">Choose the university…</option>
          {destinations.map((d) => (
            <optgroup key={d.id} label={d.name}>
              {universities
                .filter((u) => u.destinationId === d.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        <span className="text-[11px]">Not in the list? A Super Admin can add the university in Setup → Universities.</span>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Programme <span className="text-[11px]">(optional — as named on the letter)</span>
        <Select name="program_id" defaultValue="" disabled={!universityId} key={universityId}>
          <option value="">{universityId ? (theirs.length ? "Choose the programme…" : "No programmes on file for this university") : "Choose the university first"}</option>
          {theirs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.level ? ` · ${p.level}` : ""}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Intake
        <Input name="intake" defaultValue={defaultIntake} placeholder="e.g. Fall 2027" className="w-48" />
      </label>

      <div className="flex flex-col gap-1 text-xs text-muted">
        Admission letter
        <FileField accept={ACCEPTED_DOCUMENT_ACCEPT} required noun="admission letter" hint="PDF or photo" onChange={(s) => setLetterReady(Boolean(s.file))} />
      </div>

      <Button type="submit" variant="primary" pending={pending} disabled={!universityId || !letterReady} status={{ state, label: "Recorded.", showError: true }}>
        Record admission
      </Button>
    </form>
  );
}
