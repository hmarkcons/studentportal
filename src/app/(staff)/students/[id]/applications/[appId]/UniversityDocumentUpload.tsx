"use client";

import { useActionState, useState } from "react";
import { FileUp } from "lucide-react";
import { uploadApplicationDocument } from "@/lib/actions/documents";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";

/** What universities send back, offered as the name so most uploads are one click. */
const SUGGESTED_NAMES = [
  "Acceptance letter",
  "Offer letter",
  "Conditional offer letter",
  "Unconditional offer letter",
  "Admission letter",
  "Pre-admission letter",
  "Invitation letter",
  "Letter of acceptance (LOA)",
  "CAS",
  "I-20",
  "Confirmation of enrolment (CoE)",
  "Tuition fee receipt",
];

/**
 * Files a document from the university on this application. It is listed
 * under Acceptance Letters in the Documents tab and on the student's own
 * Documents page, approved, and the stages follow (uploadApplicationDocument).
 */
export function UniversityDocumentUpload({
  studentId,
  applicationId,
  universityName,
  revalidateTo,
}: {
  studentId: string;
  applicationId: string;
  universityName: string;
  revalidateTo: string;
}) {
  const action = uploadApplicationDocument.bind(null, studentId, applicationId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [ready, setReady] = useState(false);
  // A fresh form after each upload, so the next letter starts empty.
  const [round, setRound] = useState(0);
  // Adjusted during render when a new result arrives — React's pattern for
  // resetting state from a changed value, without an effect.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.success) {
      setRound((r) => r + 1);
      setReady(false);
    }
  }

  return (
    <form key={round} action={formAction} className="flex flex-col gap-3" data-university-upload>
      <p className="text-xs text-muted">
        Anything {universityName} sends — an acceptance or offer letter, a CAS, an I-20. It is filed under Acceptance Letters, the
        student sees it on their Documents page, and the application and country stages move on by themselves.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-col gap-1 text-xs text-muted">
          What it is
          <Input name="name" list={`university-doc-names-${applicationId}`} required maxLength={120} placeholder="Acceptance letter" />
          <datalist id={`university-doc-names-${applicationId}`}>
            {SUGGESTED_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <FileField multiple required accept={ACCEPTED_DOCUMENT_ACCEPT} hint="PDF, Word or photo" noun="document" onChange={(s) => setReady(Boolean(s.file) && !s.busy)} />
        <Button type="submit" variant="primary" size="sm" pending={pending} disabled={!ready} status={{ state, label: "Filed under Acceptance Letters.", showError: true }}>
          <FileUp aria-hidden className="h-3.5 w-3.5 shrink-0" />
          Upload
        </Button>
      </div>
    </form>
  );
}
