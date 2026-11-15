"use client";

import { useActionState, useState } from "react";
import { FileUp } from "lucide-react";
import { uploadApplicationDocument } from "@/lib/actions/documents";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";
import { FEE_RECEIPT_SECTION_LABEL, looksLikeReceipt } from "@/lib/applicationFeeReceipts";

type Kind = "letter" | "receipt" | "requirement";

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
 *
 * A specific requirement of the university goes to Other, named there with
 * the university and programme and kept with that university's others: with
 * a file it is filed approved; with none, the student is asked to upload it.
 */
function doneLabel({ kind, withFile }: { kind: Kind; withFile: boolean }): string {
  if (kind === "receipt") return `Filed under ${FEE_RECEIPT_SECTION_LABEL} — hidden from the student.`;
  if (kind === "requirement") return withFile ? "Filed under Other, approved." : "Added to Other — the student is asked to upload it.";
  return "Filed under Acceptance Letters.";
}

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
  // The file chosen, and whether it is still being got ready.
  const [chosen, setChosen] = useState({ file: false, busy: false });
  // A fresh form after each upload, so the next letter starts empty.
  const [round, setRound] = useState(0);
  const [kind, setKind] = useState<Kind>("letter");
  const [kindChosen, setKindChosen] = useState(false);
  // What the last upload was filed as, for its confirmation once the form is fresh again.
  const [filedAs, setFiledAs] = useState<{ kind: Kind; withFile: boolean }>({ kind: "letter", withFile: true });
  // Adjusted during render when a new result arrives — React's pattern for
  // resetting state from a changed value, without an effect.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.success) {
      setRound((r) => r + 1);
      setChosen({ file: false, busy: false });
      setKind("letter");
      setKindChosen(false);
    }
  }

  return (
    <form key={round} action={formAction} onSubmit={() => setFiledAs({ kind, withFile: chosen.file })} className="flex flex-col gap-3" data-university-upload>
      <p className="text-xs text-muted">
        Anything {universityName} sends. A letter — acceptance or offer, a CAS, an I-20 — is filed under Acceptance Letters, the
        student sees it on their Documents page, and the application and country stages move on by themselves. A receipt or an
        invoice goes to {FEE_RECEIPT_SECTION_LABEL} with this application&rsquo;s receipts, hidden from the student until
        &ldquo;Show to the student&rdquo; is ticked, and moves no stage. Something only {universityName} asks for goes to
        Other, named with the university and programme beside its others: with a file it is filed approved; with none, the
        student is asked to upload it.
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
            <option value="requirement">Other (a specific requirement by the university)</option>
          </Select>
        </label>
        <FileField
          multiple
          required={kind !== "requirement"}
          hint={kind === "requirement" ? "Any file type — or none, for the student to upload" : "Any file type"}
          noun="document"
          onChange={(s) => setChosen({ file: Boolean(s.file), busy: Boolean(s.busy) })}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          pending={pending}
          // A requirement may go without a file; anything else waits for one.
          disabled={chosen.busy || (kind !== "requirement" && !chosen.file)}
          status={{ state, label: doneLabel(filedAs), showError: true }}
        >
          <FileUp aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {kind === "requirement" && !chosen.file ? "Add requirement" : "Upload"}
        </Button>
      </div>
    </form>
  );
}
