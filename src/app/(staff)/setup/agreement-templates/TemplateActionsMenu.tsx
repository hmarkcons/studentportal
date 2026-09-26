"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteAgreementTemplate } from "@/lib/actions/agreementTemplates";
import { SlideOver } from "@/components/ui/SlideOver";
import { useButtonAction } from "@/components/useButtonAction";
import { useAnchoredMenu } from "@/components/useAnchoredMenu";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value ?? "—"}</span>
    </div>
  );
}

export type TemplateRecord = {
  id: string;
  name: string;
  signatory_name: string;
  wording: string | null;
  destinationName: string | null;
};

export function TemplateActionsMenu({ template, canManage }: { template: TemplateRecord; canManage: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  // On the screen beside its button, opening upwards when there is no room
  // below — hung from the button, the last row's menu ran off the page.
  const { anchor, menu, style: menuStyle, portal } = useAnchoredMenu(menuOpen, () => setMenuOpen(false));
  const del = useButtonAction();

  async function handleDelete() {
    if (!confirm(`Delete the "${template.name}" agreement template?`)) return;
    setMenuOpen(false);
    // deleteAgreementTemplate redirects on success (it throws internally, so
    // it only ever resolves to a value on the error path). The menu row that
    // was pressed is closed by then, so success is a toast and a failure is
    // said under the ⋮ trigger.
    await del.run(() => deleteAgreementTemplate(template.id), { toast: "Deleted." });
  }

  return (
    <div className="relative inline-block text-left">
      <button ref={anchor} onClick={() => setMenuOpen((v) => !v)} className="rounded-md px-2 py-1 text-lg text-muted hover:bg-bg hover:text-ink" aria-label="Actions">
        ⋮
      </button>
      {menuOpen &&
        portal(
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div ref={menu} style={menuStyle} data-menu className="z-20 w-40 rounded-md border border-border bg-card py-1 shadow-lg">
              <button
                onClick={() => {
                  setViewOpen(true);
                  setMenuOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
              >
                👁️ View
              </button>
              {canManage && (
                <Link
                  href={`/setup/agreement-templates/${template.id}`}
                  onClick={() => setMenuOpen(false)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
                >
                  ✏️ Edit
                </Link>
              )}
              {canManage && (
                <button onClick={handleDelete} className="block w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-bg">
                  🗑️ Delete
                </button>
              )}
            </div>
          </>
        )}
      {del.state?.error && (
        <p role="alert" className="absolute right-0 mt-1 w-56 text-xs text-danger">
          {del.state.error}
        </p>
      )}

      <SlideOver open={viewOpen} onClose={() => setViewOpen(false)} title={template.name}>
        <div className="flex flex-col">
          <Row label="Destination" value={template.destinationName} />
          <Row label="Signatory" value={template.signatory_name} />
          <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Wording</p>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-xs text-ink">
            {template.wording || "(no wording configured — falls back to legacy default wording for this destination, if any)"}
          </pre>
        </div>
      </SlideOver>
    </div>
  );
}
