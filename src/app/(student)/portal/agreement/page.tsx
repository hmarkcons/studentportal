import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SubmitSignedAgreementForm } from "./SubmitSignedAgreementForm";
import { evaluateAgreementGate } from "@/lib/portalGate";

export default async function PortalAgreementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const { data: agreements } = await supabase
    .from("agreements")
    .select("id, status, version, signed_file_path, video_recording_path, signing_method, created_at, document_status, video_status, document_review_note, video_review_note")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  const links = new Map<string, string>();
  await Promise.all(
    (agreements ?? [])
      .filter((a) => a.signed_file_path)
      .map(async (a) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(a.signed_file_path!, 3600);
        if (data?.signedUrl) links.set(a.id, data.signedUrl);
      })
  );

  // While this is outstanding the proxy holds the student here, so say plainly
  // why the rest of the portal is unavailable and what unlocks it.
  const gate = evaluateAgreementGate(agreements ?? []);

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Agreement Repository</h2>

      {gate.locked && (
        <Card className="mb-4 bg-warning-bg">
          <h3 className="mb-1 text-sm font-semibold text-warning">Two things to do before your portal opens</h3>
          <p className="mb-2 text-sm text-warning">
            Because you are signing outside Karachi, we need your e-signed agreement and a short video of you confirming
            you signed it. Until both are here, the rest of your portal stays locked.
          </p>
          <ol className="mb-2 flex list-inside list-decimal flex-col gap-1 text-sm text-warning">
            <li className={gate.needsVideo ? "" : "line-through opacity-70"}>
              Record the short consent video below {gate.needsVideo ? "" : "— done"}
            </li>
            <li className={gate.needsDocument ? "" : "line-through opacity-70"}>
              Attach your signed agreement {gate.needsDocument ? "" : "— done"}
            </li>
          </ol>
          <p className="text-xs text-warning">
            Submit both together using the form below. Everything unlocks as soon as they are received — you do not have to
            wait for us to review them. Stuck? Open a Support ticket and your counselor will help.
          </p>
        </Card>
      )}
      <div className="flex flex-col gap-3">
        {(agreements ?? []).map((a) => (
          <Card key={a.id}>
            <div className="overflow-x-auto">
              {/* Wraps rather than scrolls: at 320px the version line and the
                  status badge don't fit side by side, and inside the scroller
                  the badge was clipped mid-word instead of moving down. */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="whitespace-nowrap text-sm text-ink">
                  Version {a.version} · {new Date(a.created_at).toLocaleDateString()}
                </p>
                <Badge tone={a.status === "signed" ? "success" : "warning"}>{a.status}</Badge>
              </div>
            </div>
            {links.has(a.id) && (
              <a href={links.get(a.id)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-primary underline">
                View / download
              </a>
            )}

            {/* E-signature agreements are signed and submitted by the student
                themself; paper ones are handled in the Karachi office. */}
            {a.signing_method === "e_signature" && a.status !== "signed" && (
              a.signed_file_path && a.video_recording_path ? (
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                  Submitted — waiting for your counselor to verify the video and agreement.
                </p>
              ) : (
                <>
                  {/* Say what was wrong before showing the form again — being
                      asked to redo something with no reason is the most
                      frustrating version of this. */}
                  {(a.document_status === "rejected" || a.video_status === "rejected") && (
                    <div className="mt-3 rounded-md bg-warning-bg p-3">
                      <p className="mb-1 text-sm font-medium text-warning">Your counselor has asked you to redo this</p>
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
          </Card>
        ))}
        {(!agreements || agreements.length === 0) && <EmptyState>No agreement on file yet.</EmptyState>}
      </div>
    </div>
  );
}
