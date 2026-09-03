"use client";

import { useState } from "react";
import { deleteAgreement } from "@/lib/actions/agreements";
import { SlideOver } from "@/components/ui/SlideOver";
import { EditAgreementForm } from "./GenerateAgreementForm";

type AgreementTemplateOption = {
  id: string;
  name: string;
  signatory_name: string;
  destination: { display_name: string } | { display_name: string }[] | null;
};

type AgreementRecord = {
  id: string;
  status: string;
  template_id: string | null;
  signing_method: string | null;
  admin_charge_override: number | null;
  consultancy_fee_override: number | null;
  discount_amount: number | null;
  installment_count: number | null;
  created_at: string;
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value ?? "—"}</span>
    </div>
  );
}

export function AgreementActionsMenu({
  agreement,
  studentId,
  templates,
  links,
  canEdit,
  canDelete,
}: {
  agreement: AgreementRecord;
  studentId: string;
  templates: AgreementTemplateOption[];
  links?: { templateUrl?: string; signedUrl?: string; pdfUrl?: string };
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this agreement? This cannot be undone.")) return;
    setDeleteError(null);
    const result = await deleteAgreement(agreement.id, studentId);
    if (result?.error) setDeleteError(result.error);
    setMenuOpen(false);
  }

  return (
    <div className="relative inline-block text-left">
      <button onClick={() => setMenuOpen((v) => !v)} className="rounded-md px-2 py-1 text-lg text-muted hover:bg-bg hover:text-ink" aria-label="Actions">
        ⋮
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-36 rounded-md border border-border bg-card py-1 shadow-lg">
            <button
              onClick={() => {
                setViewOpen(true);
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
            >
              👁️ View
            </button>
            {canEdit && (
              <button
                onClick={() => {
                  setEditOpen(true);
                  setMenuOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
              >
                ✏️ Edit
              </button>
            )}
            {canDelete && (
              <button onClick={handleDelete} className="block w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-bg">
                🗑️ Delete
              </button>
            )}
          </div>
        </>
      )}
      {deleteError && <p className="absolute right-0 mt-1 w-56 text-xs text-danger">{deleteError}</p>}

      <SlideOver open={viewOpen} onClose={() => setViewOpen(false)} title="Agreement details">
        <div className="flex flex-col">
          <Row label="Status" value={agreement.status} />
          <Row label="Signing method" value={agreement.signing_method} />
          <Row label="Created" value={new Date(agreement.created_at).toLocaleDateString()} />
          <Row label="Admin charge override" value={agreement.admin_charge_override} />
          <Row label="Consultancy fee override" value={agreement.consultancy_fee_override} />
          <Row label="Discount" value={agreement.discount_amount} />
          <Row label="Installments" value={agreement.installment_count} />

          <div className="mt-3 flex flex-col gap-2">
            {links?.signedUrl && (
              <a href={links.signedUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                View signed copy
              </a>
            )}
            {links?.pdfUrl && (
              <a href={links.pdfUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                View generated agreement
              </a>
            )}
            {!links?.pdfUrl && links?.templateUrl && (
              <a href={links.templateUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                View blank template
              </a>
            )}
            {!links?.signedUrl && !links?.pdfUrl && !links?.templateUrl && <p className="text-sm text-muted">No document generated yet.</p>}
          </div>
        </div>
      </SlideOver>

      {canEdit && (
        <SlideOver open={editOpen} onClose={() => setEditOpen(false)} title="Edit agreement">
          <EditAgreementForm agreement={agreement} studentId={studentId} templates={templates} onSuccess={() => setEditOpen(false)} />
        </SlideOver>
      )}
    </div>
  );
}
