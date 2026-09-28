import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateOnly } from "@/lib/formatDate";
import { SubmitSignedAgreementForm } from "./SubmitSignedAgreementForm";
import { evaluateAgreementGate } from "@/lib/portalGate";
import { uploadedLine } from "@/lib/activityStamp";
import { signedAgreementGroups } from "@/lib/studentAgreements";


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
      "id, status, version, signed_file_path, video_recording_path, pdf_path, signing_method, created_at, document_status, video_status, document_review_note, video_review_note, signed_file_uploaded_at, video_uploaded_at, approval_undone_at, is_backup"
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

  // The country each is for, from a function that answers that and nothing
  // else: the templates themselves are staff-only (0290).
  const { data: countries } = await supabase.rpc("my_agreement_countries");
  const countryById = new Map(((countries ?? []) as { agreement_id: string; country: string | null }[]).map((c) => [c.agreement_id, c.country]));
  const countryOf = (a: { id: string }) => countryById.get(a.id) ?? "Your agreement";
  const signedGroups = signedAgreementGroups(
    (agreements ?? []).map((a) => ({
      id: a.id,
      status: a.status,
      created_at: a.created_at,
      signed_file_uploaded_at: a.signed_file_uploaded_at,
      country: countryOf(a),
      is_backup: a.is_backup,
    }))
  );
  const awaitingESignature = (agreements ?? []).filter((a) => a.signing_method === "e_signature" && a.status !== "signed");
  // A draft is still being prepared by the office; only one sent to be signed is worth a line.
  const awaitingPaper = (agreements ?? []).filter((a) => a.signing_method === "paper" && a.status === "pending_signature");

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Your agreement</h2>
      <p className="mb-4 text-sm text-muted">
        Your signed agreement with HMARK Consultants. Where one was corrected, the earlier version is kept below it for your
        records, marked as replaced.
      </p>

      {/* Two different reasons the portal is held back, and telling a student
          to upload something they have already uploaded would be worse than
          saying nothing. When staff take an approval back the student has
          nothing to do: the files are still on file, and the wait is ours. */}
      {gate.locked && gate.reason === "awaiting_reverification" && (
        <Card className="mb-4 bg-warning-bg">
          <h3 className="mb-1 text-sm font-semibold text-warning">We are checking your agreement again</h3>
          <p className="mb-2 text-sm text-warning">
            Your signed agreement and consent video are both with us — nothing is missing and there is nothing for you to
            send. Someone at HMARK is reviewing them once more, and the rest of your portal opens again as soon as that is
            done.
          </p>
          <p className="text-xs text-warning">
            Your agreement and your payments stay available in the meantime. If you need anything else, open a Support
            ticket and your counsellor will help.
          </p>
        </Card>
      )}

      {gate.locked && gate.reason === "awaiting_submission" && (
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

      {/* What a student keeps of their agreement: the signed copy. Drafts and
          unsigned versions are the office's working papers and are not shown —
          except the one an electronic signer has to download, sign and send
          back, which is the only way they can sign it. */}
      {awaitingESignature.length > 0 && (
        <section className="mb-6 flex flex-col gap-3" data-awaiting-signature>
          <h3 className="text-sm font-semibold text-ink">Waiting for your signature</h3>
          <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
            {awaitingESignature.map((a) => {
              const awaitingReview = Boolean(a.signed_file_path && a.video_recording_path);
              return (
                <Card key={a.id}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium text-ink">{countryOf(a)}</p>
                    <Badge tone="warning">{STATUS_LABELS[a.status] ?? a.status.replace(/_/g, " ")}</Badge>
                  </div>
                  {generated.has(a.id) && (
                    <a
                      href={generated.get(a.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      📄 Download to sign
                    </a>
                  )}
                  <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
                    {uploadedLine({ at: a.signed_file_uploaded_at, byRole: "student", audience: "student" }) && (
                      <span>Signed agreement · {uploadedLine({ at: a.signed_file_uploaded_at, byRole: "student", audience: "student" })}</span>
                    )}
                    {uploadedLine({ at: a.video_uploaded_at, byRole: "student", audience: "student" }) && (
                      <span>Consent video · {uploadedLine({ at: a.video_uploaded_at, byRole: "student", audience: "student" })}</span>
                    )}
                  </div>
                  {awaitingReview ? (
                    <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                      Submitted — waiting for your counsellor to check the video and the agreement. Nothing else is needed
                      from you.
                    </p>
                  ) : (
                    <>
                      {/* Say what was wrong before showing the form again. */}
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
                      {/* Per agreement: staff may have sent back only one half. */}
                      <SubmitSignedAgreementForm
                        agreementId={a.id}
                        studentId={student.id}
                        needsDocument={!a.signed_file_path}
                        needsVideo={!a.video_recording_path}
                      />
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {awaitingPaper.length > 0 && (
        <p className="mb-6 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted" data-awaiting-paper>
          Your agreement for {awaitingPaper.map(countryOf).join(" and ")} is signed in person at the Karachi office — your
          counsellor will arrange it. Your signed copy appears here once it is filed.
        </p>
      )}

      {signedGroups.length > 0 && (
        <section className="flex flex-col gap-5" data-signed-agreements>
          {signedGroups.map((g) => (
            <div key={`${g.country}-${g.backup}`} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-ink">
                {g.country}
                {g.backup && <span className="ml-2 text-xs font-normal text-muted">backup country</span>}
              </h3>
              <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
                {g.versions.map((v) => (
                  <Card key={v.id}>
                    <div className="flex flex-col gap-2" data-signed-version={v.number} data-current={v.current ? "yes" : "no"}>
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <p className="text-sm text-ink">
                          {v.of > 1 ? `Version ${v.number} of ${v.of} · ` : ""}signed {formatDateOnly(v.signedOn, LONG_DATE)}
                        </p>
                        {v.current ? <Badge tone="success">In force</Badge> : <Badge tone="neutral">Replaced</Badge>}
                      </div>
                      {v.replaces && (
                        <p className="text-xs text-success">
                          This is the corrected agreement. It replaces version {v.replaces.number}, signed{" "}
                          {formatDateOnly(v.replaces.signedOn, LONG_DATE)}, which contained mistakes — this is the one that
                          applies.
                        </p>
                      )}
                      {v.replacedBy && (
                        <p className="text-xs text-warning">
                          This version contained mistakes and was replaced by version {v.replacedBy.number}, signed{" "}
                          {formatDateOnly(v.replacedBy.signedOn, LONG_DATE)}. It is kept for your records only — please refer
                          to version {v.replacedBy.number}.
                        </p>
                      )}
                      {signed.has(v.id) ? (
                        <a
                          href={signed.get(v.id)}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                            v.current ? "border-primary text-primary hover:bg-primary/10" : "border-border text-muted hover:bg-bg"
                          }`}
                        >
                          ✍️ View your signed copy
                        </a>
                      ) : (
                        <p className="text-xs text-muted">The office is filing your signed copy — it will appear here shortly.</p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {signedGroups.length === 0 && awaitingESignature.length === 0 && awaitingPaper.length === 0 && (
        <Card>
          <EmptyState>
            No signed agreement yet. Your counsellor prepares it once your registration is confirmed, and your signed copy
            appears here.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}
