"use client";

import { useState } from "react";
import { BookOpen, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ChecklistHeading } from "./ChecklistHeading";
import { GuideEditor, guideIsWritten, type EditableGuide } from "./GuideEditor";

export type ProfileGuideEntry = {
  kind: string;
  label: string;
  example: string;
  guide: EditableGuide;
  /** This destination's note beneath it, on a country's checklist. */
  countryNote: string | null;
};

/**
 * The documents no checklist lists: a certificate and a transcript for each
 * qualification on a student's profile, a scorecard for each test, and the
 * travel and refusal papers when there is history to show. Each kind has one
 * guide, shared by every document of that kind and every destination — and,
 * on a country's checklist, a note of that country's own.
 */
export function ProfileGuides({
  entries,
  destinationId,
  destinationLabel,
}: {
  entries: ProfileGuideEntry[];
  destinationId: string | null;
  destinationLabel: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div data-profile-guides>
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <UserRound aria-hidden className="h-4 w-4 shrink-0 text-muted" />
        <ChecklistHeading>Documents from the student&rsquo;s profile</ChecklistHeading>
      </div>
      <p className="mb-3 text-xs text-muted">
        Asked for because of what a student enters on their profile, not because a checklist lists them — one per
        qualification, per test, and for travel or refusal history.{" "}
        {destinationId
          ? `Their guides are written on All destinations; here you can add what ${destinationLabel} asks for differently.`
          : "A guide written here reaches every document of its kind, in every country."}
      </p>
      <div className="flex flex-col divide-y divide-border">
        {entries.map((e) => (
          <div key={e.kind} className="flex flex-wrap items-start gap-2 py-2" data-profile-guide={e.kind}>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{e.label}</p>
              <p className="text-xs text-muted">e.g. &ldquo;{e.example}&rdquo;</p>
              {e.guide.note && <p className="text-xs text-muted">{e.guide.note}</p>}
            </div>
            <button
              type="button"
              onClick={() => setOpen(open === e.kind ? null : e.kind)}
              aria-expanded={open === e.kind}
              className={`inline-flex items-center gap-1 text-xs hover:underline ${guideIsWritten(e.guide) ? "font-medium text-success" : "text-primary"}`}
              data-guide-edit={e.kind}
            >
              <BookOpen aria-hidden className="h-3.5 w-3.5 shrink-0" />
              {guideIsWritten(e.guide) ? "Guide" : "Add guide"}
            </button>
            {open === e.kind && (
              <div className="basis-full">
                <GuideEditor
                  target={{ profileKind: e.kind }}
                  name={e.label}
                  guide={e.guide}
                  country={destinationId ? { destinationId, label: destinationLabel, note: e.countryNote } : null}
                  sharedReadOnly={Boolean(destinationId)}
                  onClose={() => setOpen(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
    </div>
  );
}
