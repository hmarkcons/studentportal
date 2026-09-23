import { loadMyAgreements } from "@/lib/actions/staffAgreements";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ReturnSignedForm } from "./ReturnSignedForm";

const LABEL = {
  awaiting_signature: "Waiting for your signature",
  submitted: "Returned — being checked",
  signed: "Signed",
  draft: "Draft",
} as const;
const TONE = { awaiting_signature: "warning", submitted: "info", signed: "success", draft: "neutral" } as const;

/**
 * A staff member's own agreements — theirs alone, and only once sent to them.
 * RLS decides both (0271): a draft, or anyone else's agreement, never reaches
 * this page, whatever the URL.
 */
export default async function MyAgreementPage() {
  const agreements = await loadMyAgreements();

  return (
    <div className="w-full max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">My agreement</h2>
      <p className="mb-4 text-sm text-muted">Your agreement with HMARK Consultants. Only you and HR can see it.</p>

      {agreements.length === 0 && (
        <Card>
          <p className="text-sm text-muted">There&apos;s no agreement for you here yet.</p>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {agreements.map((a) => (
          <Card key={a.id}>
            <div data-my-agreement={a.id} className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{a.title}</span>
                <Badge tone={TONE[a.status]}>{LABEL[a.status]}</Badge>
              </div>

              <div className="flex flex-wrap gap-4">
                {a.pdfUrl && (
                  <a href={a.pdfUrl} target="_blank" rel="noreferrer" className="w-fit font-medium text-primary hover:underline">
                    Download the agreement
                  </a>
                )}
                {a.signedUrl && (
                  <a href={a.signedUrl} target="_blank" rel="noreferrer" className="w-fit font-medium text-primary hover:underline">
                    Download the signed copy
                  </a>
                )}
              </div>

              {a.status === "awaiting_signature" && (
                <>
                  {a.rejectionNote && (
                    <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
                      Your last signed copy was sent back: “{a.rejectionNote}”
                    </p>
                  )}
                  <p className="text-muted">
                    Download it, read it, sign it, and upload the signed copy here — a scan or a clear photo of every page.
                  </p>
                  <ReturnSignedForm agreementId={a.id} />
                </>
              )}
              {a.status === "submitted" && <p className="text-muted">Thanks — HR is checking your signed copy. You&apos;ll be emailed if anything needs another look.</p>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
