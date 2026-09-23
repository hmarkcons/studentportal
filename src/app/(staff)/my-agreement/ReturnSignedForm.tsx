"use client";

import { useActionState } from "react";
import { submitMySignedAgreement } from "@/lib/actions/staffAgreements";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";

export function ReturnSignedForm({ agreementId }: { agreementId: string }) {
  const action = submitMySignedAgreement.bind(null, agreementId);
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <FileField accept={ACCEPTED_DOCUMENT_ACCEPT} required noun="signed agreement" inputClassName="text-sm" />
      <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Returned — it will be checked.", showError: true }}>
        Upload signed copy
      </Button>
    </form>
  );
}
