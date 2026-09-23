"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteStaffAgreementTemplate, duplicateStaffAgreementTemplate } from "@/lib/actions/staffAgreements";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";

export function StaffTemplateActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const del = useButtonAction();
  const copy = useButtonAction();
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/setup/agreement-templates/staff/${id}`}
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-ink hover:bg-bg"
      >
        Edit
      </Link>
      {/* Straight into the copy's editor: a copy is only ever made to be changed. */}
      <Button
        size="sm"
        pending={copy.pending}
        status={{ state: copy.state, label: "Copied.", showError: true }}
        onClick={async () => {
          const result = await copy.run(() => duplicateStaffAgreementTemplate(id));
          if (result && "id" in result && result.id) router.push(`/setup/agreement-templates/staff/${result.id}`);
        }}
      >
        Duplicate
      </Button>
      <Button
        size="sm"
        variant="ghost"
        pending={del.pending}
        status={{ state: del.state, label: "Deleted.", showError: true }}
        aria-label={`Delete ${name}`}
        onClick={() => {
          if (!confirm(`Delete the "${name}" template? Agreements already generated from it keep their own PDFs.`)) return;
          void del.run(() => deleteStaffAgreementTemplate(id), { toast: "Template deleted." });
        }}
      >
        🗑️
      </Button>
    </div>
  );
}
