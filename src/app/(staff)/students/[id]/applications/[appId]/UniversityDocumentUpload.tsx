"use client";

import { useActionState, useState } from "react";
import { FileUp } from "lucide-react";
import { uploadApplicationDocument } from "@/lib/actions/documents";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { FEE_RECEIPT_SECTION_LABEL, looksLikeReceipt } from "@/lib/applicationFeeReceipts";

type Kind = "letter" | "receipt";

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
  "Application fee receipt",
  "Application fee invoice",
  "Tuition fee receipt",
];

/**
 * Files a document from the university on this application. A letter is
 * listed under Acceptance Letters in the Documents tab and on the student's
 * own Documents page, approved, and the stages follow
 * (uploadApplicationDocument). A receipt or an invoice goes with the
 * application's receipts in Receipts - Universities instead (0366): hidden
 * from the student until shown, and moving no stage. The choice follows the
 * name typed — "receipt", "invoice", "payment" — until it is made by hand.
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
  const [kind, setKind] = useState<Kind>("letter");
  const [kindChosen, setKindChosen] = useState(false);
  // What the last upload was filed as, for its confirmation once the form is fresh again.
  const [filedAs, setFiledAs] = useState<Kind>("letter");
  // Adjusted during render when a new result arrives — React's pattern for
  // resetting state from a changed value, without an effect.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.success) {
      setRound((r) => r + 1);
      setReady(false);
      setKind("letter");
      setKindChosen(false);
    }
  }

  return (
    <form key={round} action={formAction} onSubmit={() => setFiledAs(kind)} className="flex flex-col gap-3" data-university-upload>
      <p className="text-xs text-muted">
        Anything {universityName} sends. A letter — acceptance or offer, a CAS, an I-20 — is filed under Acceptance Letters, the
        student sees it on their Documents page, and the application and country stages move on by themselves. A receipt or an
        invoice goes to {FEE_RECEIPT_SECTION_LABEL} with this application&rsquo;s receipts, hidden from the student until
        &ldquo;Show to the student&rdquo; is ticked, and moves no stage.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-col gap-1 text-xs text-muted">
          What it is
          <Input
            name="name"
            list={`university-doc-names-${applicationId}`}
            required
            maxLength={120}
            placeholder="Acceptance letter"
            onChange={(e) => {
              if (!kindChosen) setKind(looksLikeReceipt(e.target.value) ? "receipt" : "letter");
            }}
          />
          <datalist id={`university-doc-names-${applicationId}`}>
            {SUGGESTED_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="flex min-w-56 flex-col gap-1 text-xs text-muted">
          File under
          <Select
            name="kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setKindChosen(true);
            }}
            data-university-upload-kind
          >
            <option value="letter">Acceptance Letters (a letter)</option>
            <option value="receipt">{FEE_RECEIPT_SECTION_LABEL} (a receipt or invoice)</option>
          </Select>
        </label>
        <FileField multiple required accept={ACCEPTED_DOCUMENT_ACCEPT} hint="PDF, Word or photo" noun="document" onChange={(s) => setReady(Boolean(s.file) && !s.busy)} />
        <Button type="submit" variant="primary" size="sm" pending={pending} disabled={!ready} status={{ state, label: filedAs === "receipt" ? `Filed under ${FEE_RECEIPT_SECTION_LABEL} — hidden from the student.` : "Filed under Acceptance Letters.", showError: true }}>
          <FileUp aria-hidden className="h-3.5 w-3.5 shrink-0" />
          Upload
        </Button>
      </div>
    </form>
  );
}
