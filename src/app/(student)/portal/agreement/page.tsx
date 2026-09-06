import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SubmitSignedAgreementForm } from "./SubmitSignedAgreementForm";

export default async function PortalAgreementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
  if (!student) return null;

  const { data: agreements } = await supabase
    .from("agreements")
    .select("id, status, version, signed_file_path, video_recording_path, signing_method, created_at")
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

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Agreement Repository</h2>
      <div className="flex flex-col gap-3">
        {(agreements ?? []).map((a) => (
          <Card key={a.id}>
            <div className="overflow-x-auto">
              <div className="flex items-center justify-between gap-4">
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
                <SubmitSignedAgreementForm agreementId={a.id} studentId={student.id} />
              )
            )}
          </Card>
        ))}
        {(!agreements || agreements.length === 0) && <EmptyState>No agreement on file yet.</EmptyState>}
      </div>
    </div>
  );
}
