"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionForm } from "./SectionForm";
import { deleteVisaSection, moveVisaSection, setVisaSectionHidden } from "@/lib/actions/visaPageBuilder";
import { audienceLabel, type VisaPageSection } from "@/lib/visaPage";

export function SectionRow({
  section,
  scopeLabel,
  canEdit,
  isFirst,
  isLast,
}: {
  section: VisaPageSection;
  scopeLabel: string;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(what: "up" | "down" | "hide" | "show" | "delete") {
    if (what === "delete" && !confirm(`Delete “${section.title}”? This cannot be undone — hide it instead if you might want it back.`)) {
      return;
    }
    setBusy(what);
    setError(null);
    const result =
      what === "up" || what === "down"
        ? await moveVisaSection(section.id, what)
        : what === "delete"
          ? await deleteVisaSection(section.id)
          : await setVisaSectionHidden(section.id, what === "hide");
    setBusy(null);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  const hidden = section.status === "hidden";

  return (
    <div className={`rounded-md border border-border p-3 ${hidden ? "opacity-60" : ""}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{section.title}</span>
        <Badge tone={section.audience === "staff" ? "warning" : "neutral"}>{audienceLabel(section.audience)}</Badge>
        {hidden && <Badge tone="neutral">Hidden</Badge>}
      </div>

      {section.body && <p className="whitespace-pre-line text-xs text-muted">{section.body}</p>}
      {section.linkUrl && (
        <p className="mt-1 text-xs">
          <span className="text-muted">Link: </span>
          <span className="text-primary">{section.linkLabel}</span>{" "}
          <span className="text-muted">&rarr; {section.linkUrl}</span>
        </p>
      )}

      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SectionForm
            destinationId={section.destinationId}
            scopeLabel={scopeLabel}
            section={section}
            trigger={
              <Button type="button" variant="outline" size="sm">
                Edit
              </Button>
            }
          />
          <Button type="button" variant="ghost" size="sm" disabled={isFirst} pending={busy === "up"} onClick={() => run("up")}>
            ↑
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={isLast} pending={busy === "down"} onClick={() => run("down")}>
            ↓
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            pending={busy === "hide" || busy === "show"}
            onClick={() => run(hidden ? "show" : "hide")}
          >
            {hidden ? "Show" : "Hide"}
          </Button>
          <button
            type="button"
            onClick={() => run("delete")}
            disabled={busy === "delete"}
            className="text-xs text-danger hover:underline disabled:opacity-40"
          >
            {busy === "delete" ? "Deleting…" : "Delete"}
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
}
