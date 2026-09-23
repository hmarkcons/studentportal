"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  deleteStaffAgreement,
  generateStaffAgreement,
  loadStaffAgreementPanel,
  regenerateStaffAgreementPdf,
  sendBackStaffAgreement,
  sendStaffAgreementForSigning,
  uploadSignedStaffAgreement,
  verifyStaffAgreement,
  type StaffAgreementView,
} from "@/lib/actions/staffAgreements";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";
import { useButtonAction } from "@/components/useButtonAction";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";

export const STATUS_LABEL: Record<StaffAgreementView["status"], string> = {
  draft: "Draft",
  awaiting_signature: "Waiting for their signature",
  submitted: "Returned — verify it",
  signed: "Signed",
};

export const STATUS_TONE: Record<StaffAgreementView["status"], "neutral" | "warning" | "info" | "success"> = {
  draft: "neutral",
  awaiting_signature: "warning",
  submitted: "info",
  signed: "success",
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" }) : "";

function FileLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="w-fit text-xs font-medium text-primary hover:underline">
      {children}
    </a>
  );
}

/** Upload a signed file — onto an existing agreement, or as a new one signed outside the portal. */
function UploadSigned({
  staffId,
  agreementId,
  onDone,
}: {
  staffId: string;
  agreementId: string | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = await uploadSignedStaffAgreement(staffId, agreementId, prev, formData);
      if (result.success) onDone();
      return result;
    },
    undefined
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {!agreementId && <Input name="title" placeholder="Title, e.g. Employment Agreement 2026" required className="min-w-[220px] flex-1" />}
      <FileField accept={ACCEPTED_DOCUMENT_ACCEPT} required noun="agreement" inputClassName="text-xs" />
      <Button type="submit" size="sm" pending={pending} status={{ state, label: "Uploaded.", showError: true }}>
        {agreementId ? "Upload signed copy" : "Upload"}
      </Button>
    </form>
  );
}

function AgreementRow({ staffId, agreement, reload }: { staffId: string; agreement: StaffAgreementView; reload: () => void }) {
  const send = useButtonAction();
  const regen = useButtonAction();
  const verify = useButtonAction();
  const back = useButtonAction();
  const del = useButtonAction();
  const [note, setNote] = useState("");
  const [showBack, setShowBack] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const a = agreement;
  const beforeSigning = a.status === "draft" || a.status === "awaiting_signature";

  return (
    <li data-staff-agreement={a.id} className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{a.title}</span>
        <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
        <span className="text-xs text-muted">
          {a.source === "uploaded" ? "Uploaded" : "Generated"} {when(a.createdAt)}
          {a.sentAt ? ` · sent ${when(a.sentAt)}` : ""}
          {a.submittedAt ? ` · returned ${when(a.submittedAt)}` : ""}
          {a.verifiedAt ? ` · signed ${when(a.verifiedAt)}` : ""}
        </span>
      </div>
      {a.rejectionNote && a.status === "awaiting_signature" && (
        <p className="text-xs text-warning">Sent back: “{a.rejectionNote}”</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <FileLink href={a.pdfUrl}>View PDF</FileLink>
        <FileLink href={a.signedUrl}>View signed copy</FileLink>

        {a.status === "draft" && (
          <Button
            size="sm"
            variant="primary"
            pending={send.pending}
            status={{ state: send.state, label: sentMessage ?? "Sent.", showError: true }}
            onClick={async () => {
              const result = await send.run(() => sendStaffAgreementForSigning(a.id));
              if (result && "success" in result && result.success) {
                setSentMessage(result.message ?? "Sent.");
                reload();
              }
            }}
          >
            Send for signing
          </Button>
        )}
        {beforeSigning && a.hasTemplate && (
          <Button
            size="sm"
            pending={regen.pending}
            status={{ state: regen.state, label: "Regenerated.", showError: true }}
            onClick={async () => {
              await regen.run(() => regenerateStaffAgreementPdf(a.id));
              reload();
            }}
          >
            Regenerate PDF
          </Button>
        )}
        {beforeSigning && (
          <Button size="sm" type="button" onClick={() => setShowUpload((v) => !v)}>
            {showUpload ? "Cancel upload" : "Upload signed copy"}
          </Button>
        )}
        {a.status === "submitted" && (
          <>
            <Button
              size="sm"
              variant="success"
              pending={verify.pending}
              status={{ state: verify.state, label: "Verified.", showError: true }}
              onClick={async () => {
                await verify.run(() => verifyStaffAgreement(a.id));
                reload();
              }}
            >
              Verify signed copy
            </Button>
            <Button size="sm" type="button" onClick={() => setShowBack((v) => !v)}>
              {showBack ? "Cancel" : "Send back"}
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          pending={del.pending}
          status={{ state: del.state, label: "Deleted.", showError: true }}
          onClick={async () => {
            if (!confirm(`Delete "${a.title}"? Its PDF and any signed copy are deleted too.`)) return;
            await del.run(() => deleteStaffAgreement(a.id), { toast: "Agreement deleted." });
            reload();
          }}
          aria-label={`Delete ${a.title}`}
        >
          🗑️
        </Button>
      </div>

      {showUpload && beforeSigning && (
        <UploadSigned
          staffId={staffId}
          agreementId={a.id}
          onDone={() => {
            setShowUpload(false);
            reload();
          }}
        />
      )}
      {showBack && a.status === "submitted" && (
        <div className="flex flex-wrap items-end gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs fixing? They'll see this." className="min-w-[240px] flex-1" />
          <Button
            size="sm"
            variant="danger"
            pending={back.pending}
            disabled={!note.trim()}
            status={{ state: back.state, label: "Sent back.", showError: true }}
            onClick={async () => {
              const result = await back.run(() => sendBackStaffAgreement(a.id, note));
              if (result && "success" in result && result.success) {
                setShowBack(false);
                setNote("");
                reload();
              }
            }}
          >
            Send back to them
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * One staff member's agreements, and the ways to add one: generate from a
 * template, or upload an agreement already signed outside the portal.
 *
 * Loads its own data, so Staff Management and the Agreement Generator show
 * the same thing — and reloads after every change, because each action here
 * moves an agreement to a different stage with different actions.
 */
export function StaffAgreementsPanel({ staffId, staffName }: { staffId: string; staffName: string }) {
  const [data, setData] = useState<{ agreements: StaffAgreementView[]; templates: { id: string; name: string }[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showUploadNew, setShowUploadNew] = useState(false);

  const apply = useCallback((result: Awaited<ReturnType<typeof loadStaffAgreementPanel>>) => {
    if ("error" in result) setLoadError(result.error);
    else {
      setLoadError(null);
      setData(result);
    }
  }, []);

  const reload = useCallback(async () => {
    apply(await loadStaffAgreementPanel(staffId));
  }, [staffId, apply]);

  // The first load. State is set in the promise's callback, not in the effect
  // itself, and not at all if the panel was closed before the answer came.
  useEffect(() => {
    let live = true;
    loadStaffAgreementPanel(staffId).then((result) => {
      if (live) apply(result);
    });
    return () => {
      live = false;
    };
  }, [staffId, apply]);

  const [genState, generate, generating] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = await generateStaffAgreement(staffId, prev, formData);
      if (result.success) await reload();
      return result;
    },
    undefined
  );

  if (loadError) return <p className="text-sm text-danger">{loadError}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div data-staff-agreements-panel className="flex flex-col gap-5 text-sm">
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Agreements</h4>
        {data.agreements.length === 0 ? (
          <p className="text-xs text-muted">No agreements for {staffName} yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.agreements.map((a) => (
              <AgreementRow key={a.id} staffId={staffId} agreement={a} reload={reload} />
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-border pt-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Generate from a template</h4>
        {data.templates.length === 0 ? (
          <p className="text-xs text-muted">
            No staff agreement templates yet — add one under Setup → Agreement templates → Staff.
          </p>
        ) : (
          <form action={generate} className="flex flex-wrap items-end gap-2">
            <Select name="template_id" required defaultValue="">
              <option value="">Template…</option>
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Button
              type="submit"
              variant="primary"
              pending={generating}
              status={{ state: genState, label: genState?.success ? genState.message ?? "Generated." : "Generated.", showError: true }}
            >
              Generate
            </Button>
          </form>
        )}
        <p className="mt-1 text-xs text-muted">
          It&apos;s filled in from their staff record as it is now, including pay. Review the PDF, then send it to them to sign.
        </p>
      </section>

      <section className="border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">Signed outside the portal?</h4>
          <Button size="sm" type="button" onClick={() => setShowUploadNew((v) => !v)}>
            {showUploadNew ? "Cancel" : "Upload a signed agreement"}
          </Button>
        </div>
        {showUploadNew && (
          <div className="mt-2">
            <UploadSigned
              staffId={staffId}
              agreementId={null}
              onDone={() => {
                setShowUploadNew(false);
                void reload();
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
