"use client";

import { partnerUploadLetter } from "@/lib/actions/partner";
import { ConfirmedUploadForm } from "@/components/ConfirmedUploadForm";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";

export function LetterUploadForm({
  applicationId,
  category,
  label,
  alreadySent = false,
}: {
  applicationId: string;
  category: "offer_letter" | "rejection_letter";
  label: string;
  /** A letter of this kind is already on the application. */
  alreadySent?: boolean;
}) {
  const action = partnerUploadLetter.bind(null, applicationId, category);

  // Asks before it sends. A letter a university uploads cannot be taken back
  // by them, and reissuing one leaves the first on the record.
  return (
    <ConfirmedUploadForm
      action={action}
      accept={ACCEPTED_DOCUMENT_ACCEPT}
      submitLabel={`${alreadySent ? "Replace" : "Upload"} ${label}`}
      replacing={alreadySent}
    />
  );
}
