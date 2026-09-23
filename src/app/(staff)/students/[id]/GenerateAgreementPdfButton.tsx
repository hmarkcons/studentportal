"use client";

import { generateAgreementPdf } from "@/lib/actions/agreements";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";

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
  const generate = useButtonAction();

  return (
    <Button
      type="button"
      variant="outline-primary"
      size="sm"
      onClick={() => generate.run(() => generateAgreementPdf(agreementId, studentId, revalidateTo))}
      pending={generate.pending}
      status={{ state: generate.state, label: "Generated.", showError: true }}
    >
      {/* "PDF", not "agreement": the button that creates the agreement itself
          says "Generate agreement", and two controls a few lines apart with
          the same words is a coin toss. The edit form already tells staff to
          use "Regenerate PDF" afterward, and the invoice panel next door
          labels the identical action "Generate PDF" / "Regenerate PDF". */}
      {hasPdf ? "Regenerate PDF" : "Generate PDF"}
    </Button>
  );
}
