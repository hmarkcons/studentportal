"use client";

import { useState } from "react";
import { DocumentSectionShell, ExpandAllToggle } from "@/components/DocumentSectionShell";

/**
 * A list of collapsible document sections with one expand/collapse-all control
 * above them.
 *
 * The staff Documents tab has had this since the sections were made
 * collapsible; the student's portal rendered the same shells without it, so
 * reading a whole checklist there was one click per section — on a phone,
 * which is where students read it.
 *
 * The open state lives here rather than in each shell so the control can drive
 * every section at once. DocumentSectionShell already accepts `open`/`onToggle`
 * for exactly this, falling back to managing itself when nobody does.
 *
 * Sections still start closed on every load and nothing is remembered — see
 * the note in DocumentSectionShell for why that is the right default for a
 * checklist that runs to ten sections and forty rows.
 */
export function DocumentSectionList({
  sections,
}: {
  sections: {
    key: string;
    number: number;
    label: string;
    total: number;
    approved: number;
    outstanding: number;
    rejected: number;
    content: React.ReactNode;
  }[];
}) {
  // Holds only the sections somebody has opened during this visit.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  // Derived from what is open rather than tracked separately, so the button
  // cannot say "Collapse all" while a section is already shut.
  const allExpanded = sections.length > 0 && sections.every((s) => openSections[s.key]);

  if (sections.length === 0) return null;

  return (
    <div>
      <ExpandAllToggle
        allExpanded={allExpanded}
        onToggle={() =>
          setOpenSections(allExpanded ? {} : Object.fromEntries(sections.map((s) => [s.key, true])))
        }
      />
      <div className="flex flex-col gap-3">
        {sections.map((section) => (
          <DocumentSectionShell
            key={section.key}
            number={section.number}
            label={section.label}
            total={section.total}
            approved={section.approved}
            outstanding={section.outstanding}
            rejected={section.rejected}
            open={Boolean(openSections[section.key])}
            onToggle={() => setOpenSections((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
          >
            {section.content}
          </DocumentSectionShell>
        ))}
      </div>
    </div>
  );
}
