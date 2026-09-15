"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { VisaOfficeForm } from "./VisaOfficeForm";
import { archiveVisaOffice, restoreVisaOffice, confirmVisaOffice } from "@/lib/actions/visaOffices";
import { kindLabel, type VisaOffice } from "@/lib/visaOffices";

/**
 * One row in the directory, with the two actions the office actually takes:
 * confirming an entry they have just checked, and retiring one that has closed.
 */
export function OfficeRow({
  office,
  destinationId,
  destinationName,
  archived = false,
  canEdit,
}: {
  office: VisaOffice;
  destinationId: string;
  destinationName: string;
  archived?: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "archive" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "confirm" | "archive" | "restore") {
    if (kind === "archive" && !confirm(`Archive ${office.name}? It drops off every student's page but stays on file.`)) {
      return;
    }
    setBusy(kind);
    setError(null);
    const result =
      kind === "confirm"
        ? await confirmVisaOffice(office.id)
        : kind === "archive"
          ? await archiveVisaOffice(office.id)
          : await restoreVisaOffice(office.id);
    setBusy(null);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{office.name}</span>
        <Badge tone="neutral">{kindLabel(office.kind)}</Badge>
        {office.city && <span className="text-xs text-muted">{office.city}</span>}
        {office.submitsApplications && <Badge tone="success">Applications submitted here</Badge>}
        {office.verifiedAt ? (
          <Badge tone="info">Confirmed {office.verifiedAt.slice(0, 10)}</Badge>
        ) : (
          <Badge tone="warning">Not yet confirmed</Badge>
        )}
      </div>

      <p className="text-xs text-muted">
        {[office.operator, office.address, office.phone, office.email].filter(Boolean).join(" · ") || "No details recorded"}
      </p>
      {office.officeHours && <p className="text-xs text-muted">Hours: {office.officeHours}</p>}
      {office.jurisdiction && <p className="text-xs text-muted">Covers: {office.jurisdiction}</p>}

      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <VisaOfficeForm
            destinationId={destinationId}
            destinationName={destinationName}
            office={office}
            trigger={
              <Button type="button" variant="outline" size="sm">
                Edit
              </Button>
            }
          />
          {!archived && !office.verifiedAt && (
            <Button type="button" variant="ghost" size="sm" pending={busy === "confirm"} onClick={() => run("confirm")}>
              Mark as checked
            </Button>
          )}
          {archived ? (
            <Button type="button" variant="ghost" size="sm" pending={busy === "restore"} onClick={() => run("restore")}>
              Restore
            </Button>
          ) : (
            <button
              type="button"
              onClick={() => run("archive")}
              disabled={busy === "archive"}
              className="text-xs text-danger hover:underline disabled:opacity-40"
            >
              {busy === "archive" ? "Archiving…" : "Archive"}
            </button>
          )}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
}
