import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateOnly } from "@/lib/formatDate";
import { SubmitSignedAgreementForm } from "./SubmitSignedAgreementForm";
import { evaluateAgreementGate } from "@/lib/portalGate";

// The stored values are draft / pending_signature / signed. Those are database
// words; a student should be told what is expected of them.
const STATUS_LABELS: Record<string, string> = {
  draft: "Being prepared",
  pending_signature: "Awaiting your signature",
  signed: "Signed and verified",
};

const LONG_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export default async function PortalAgreementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const { data: agreements } = await supabase
    .from("agreements")
    .select(
      "id, status, version, signed_file_path, video_recording_path, pdf_path, signing_method, created_at, document_status, video_status, document_review_note, video_review_note"
    )
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  // Two links per agreement: the agreement HMARK generated (pdf_path) and the
  // signed copy the student sent back (signed_file_path).
  //
  // The generated one was never offered here, so a student told to "attach your
  // signed agreement" had no way to obtain the agreement in the first place —
  // the one thing this page exists to hand over.
  const generated = new Map<string, string>();
  const signed = new Map<string, string>();
  await Promise.all(
    (agreements ?? []).flatMap((a) => [
      a.pdf_path
        ? supabase.storage
            .from("documents")
            .createSignedUrl(a.pdf_path, 3600)
            .then(({ data }) => {
              if (data?.signedUrl) generated.set(a.id, data.signedUrl);
            })
        : Promise.resolve(),
      a.signed_file_path
        ? supabase.storage
            .from("documents")
            .createSignedUrl(a.signed_file_path, 3600)
            .then(({ data }) => {
              if (data?.signedUrl) signed.set(a.id, data.signedUrl);
            })
        : Promise.resolve(),
    ])
  );

  // While this is outstanding the proxy holds the student here, so say plainly
  // why the rest of the portal is unavailable and what unlocks it.
  const gate = evaluateAgreementGate(agreements ?? []);

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Your agreement</h2>
      <p className="mb-4 text-sm text-muted">
        Your agreement with HMARK Consultants, and every version of it we hold.
      </p>

      {gate.locked && (
        <Card className="mb-4 bg-warning-bg">
          <h3 className="mb-1 text-sm font-semibold text-warning">Two things to do before your portal opens</h3>
          <p className="mb-2 text-sm text-warning">
            Because you are signing outside Karachi, we need your e-signed agreement and a short video of you confirming
            you signed it. Until both are here, the rest of your portal stays locked.
          </p>
          <ol className="mb-2 flex list-inside list-decimal flex-col gap-1 text-sm text-warning">
            <li className={gate.needsDocument ? "" : "line-through opacity-70"}>
              Download the agreement below, sign it, and attach it {gate.needsDocument ? "" : "— done"}
            </li>
            <li className={gate.needsVideo ? "" : "line-through opacity-70"}>
              Record the short consent video {gate.needsVideo ? "" : "— done"}
            </li>
          </ol>
          <p className="text-xs text-warning">
            Everything unlocks as soon as both are received — you do not have to wait for us to review them. Stuck? Open a
            Support ticket and your counsellor will help.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {(agreements ?? []).map((a) => {
          const awaitingReview = a.status !== "signed" && Boolean(a.signed_file_path && a.video_recording_path);
          return (
            <Card key={a.id}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="text-sm text-ink">
                  Version {a.version} · {formatDateOnly(String(a.created_at).slice(0, 10), LONG_DATE)}
                </p>
                <Badge tone={a.status === "signed" ? "success" : "warning"}>
                  {STATUS_LABELS[a.status] ?? a.status.replace(/_/g, " ")}
                </Badge>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {generated.has(a.id) && (
                  <a
                    href={generated.get(a.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    📄 {a.signing_method === "e_signature" && a.status !== "signed" ? "Download to sign" : "View agreement"}
                  </a>
                )}
                {signed.has(a.id) && (
                  <a
                    href={signed.get(a.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-ink transition-colors hover:bg-bg"
                  >
                    ✍️ View your signed copy
                  </a>
                )}
              </div>

              {/* Once staff have ticked both boxes the student should be able to
                  see that it was actually checked, not just that the status
                  flipped. */}
              {a.status === "signed" && a.signing_method === "e_signature" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  {a.document_status === "approved" && <Badge tone="success">Signed agreement approved</Badge>}
                  {a.video_status === "approved" && <Badge tone="success">Consent video approved</Badge>}
                </div>
              )}

              {/* E-signature agreements are signed and submitted by the student
                  themself; paper ones are handled in the Karachi office. */}
              {a.signing_method === "e_signature" && a.status !== "signed" && (
                awaitingReview ? (
                  <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                    Submitted — waiting for your counsellor to check the video and the agreement. Nothing else is needed
                    from you.
                  </p>
                ) : (
                  <>
                    {/* Say what was wrong before showing the form again — being
                        asked to redo something with no reason is the most
                        frustrating version of this. */}
                    {(a.document_status === "rejected" || a.video_status === "rejected") && (
                      <div className="mt-3 rounded-md bg-warning-bg p-3">
                        <p className="mb-1 text-sm font-medium text-warning">Your counsellor has asked you to redo this</p>
                        {a.video_status === "rejected" && (
                          <p className="text-sm text-warning">
                            <strong>Video:</strong> {a.video_review_note ?? "please record it again."}
                          </p>
                        )}
                        {a.document_status === "rejected" && (
                          <p className="text-sm text-warning">
                            <strong>Signed agreement:</strong> {a.document_review_note ?? "please upload it again."}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-warning">
                          What you sent before is still on file — just submit a replacement below.
                        </p>
                      </div>
                    )}
                    {/* Per agreement, not from the portal-wide gate: staff may
                        have sent back only one half, and the form should ask for
                        exactly what is missing. */}
                    <SubmitSignedAgreementForm
                      agreementId={a.id}
                      studentId={student.id}
                      needsDocument={!a.signed_file_path}
                      needsVideo={!a.video_recording_path}
                    />
                  </>
                )
              )}

              {/* A paper agreement is signed in the office, so there is nothing
                  to do here — say so rather than leaving a bare status badge. */}
              {a.signing_method === "paper" && a.status !== "signed" && (
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                  This one is signed in person at the Karachi office. Your counsellor will arrange it.
                </p>
              )}
            </Card>
          );
        })}
        {(!agreements || agreements.length === 0) && (
          <EmptyState>
            No agreement yet. Your counsellor prepares it once your registration is confirmed, and it will appear here to
            download.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
