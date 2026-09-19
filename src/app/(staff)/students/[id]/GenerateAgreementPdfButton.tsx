"use client";

import { useState } from "react";
import { generateAgreementPdf } from "@/lib/actions/agreements";
import { Button } from "@/components/ui/Button";

export function GenerateAgreementPdfButton({
  agreementId,
  studentId,
  revalidateTo,
  hasPdf,
}: {
  agreementId: string;
  studentId: string;
  revalidateTo: string;
  hasPdf: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setPending(true);
    setError(null);
    const result = await generateAgreementPdf(agreementId, studentId, revalidateTo);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline-primary" size="sm" onClick={handle} pending={pending}>
        {/* "PDF", not "agreement": the button that creates the agreement itself
            says "Generate agreement", and two controls a few lines apart with
            the same words is a coin toss. The edit form already tells staff to
            use "Regenerate PDF" afterward, and the invoice panel next door
            labels the identical action "Generate PDF" / "Regenerate PDF". */}
        {hasPdf ? "Regenerate PDF" : "Generate PDF"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
