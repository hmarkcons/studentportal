"use client";

import { useState } from "react";
import { ExternalLink, FileText, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { callLink } from "@/lib/scholarshipCallLink";

export type GuideBody = {
  id: string;
  name: string;
  region: string | null;
  academic_year: string | null;
  application_deadline: string | null;
  apply_url: string | null;
  isee_threshold: string | null;
  ispe_threshold: string | null;
  call_status: string;
  call_expected_on: string | null;
  call_pdf_url: string | null;
  /** The copy kept against this body, signed on the server. */
  call_pdf_signed_url: string | null;
  call_pdf_language: string | null;
  /** The page the call sits on, where the region publishes no single PDF. */
  call_page_url?: string | null;
  source_url: string | null;
  guide_sections: { title: string; body: string }[];
  /** From guideFreshness, resolved on the server. */
  staleFor: string | null;
};

/**
 * A scholarship body's guide, where the work actually happens.
 *
 * The directory in Setup is where these are maintained; this is where a
 * counselor reads one while a student is in front of them. Collapsed by
 * default because a guide runs to ten sections and the Scholarship tab already
 * has the student's own records on it — the deadline and the portal are the
 * two things worth seeing without opening anything.
 */
/**
 * `audience="student"` is the same guide on the student's own Scholarship
 * page, with the two lines meant for the office — "add one in Setup" and "not
 * updated" — said the way a student needs them instead.
 */
export function ScholarshipGuide({ body, audience = "staff" }: { body: GuideBody; audience?: "staff" | "student" }) {
  const student = audience === "student";
  const [open, setOpen] = useState(false);
  const sections = body.guide_sections ?? [];
  const call = callLink(body);

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{body.name}</span>
          {body.region && <span className="text-xs text-muted">{body.region}</span>}
          {body.academic_year && <Badge tone="neutral">A.Y. {body.academic_year}</Badge>}
          {/* Turns itself on in May, so nobody has to remember to mark it. */}
          {body.staleFor &&
            (student ? (
              <Badge tone="warning">details from {body.academic_year} — the {body.staleFor} call is not out yet</Badge>
            ) : (
              <Badge tone="warning">still {body.academic_year} — {body.staleFor} not updated</Badge>
            ))}
          {body.call_status === "awaiting" && (
            <Badge tone="info">
              call not published{body.call_expected_on ? ` · expected ${body.call_expected_on}` : ""}
            </Badge>
          )}
        </div>
        {sections.length > 0 && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-primary hover:underline">
            {open ? "Hide guide" : `Guide (${sections.length})`}
          </button>
        )}
      </div>

      {/* The two things a counselor reaches for, without opening anything. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs">
        <span className="text-muted">
          Deadline: <span className="font-medium text-ink">{body.application_deadline ?? (student ? "not announced yet" : "not recorded")}</span>
        </span>
        {(body.isee_threshold || body.ispe_threshold) && (
          <span className="text-muted">
            ISEE {body.isee_threshold ?? "—"} · ISPE {body.ispe_threshold ?? "—"}
          </span>
        )}
        {body.apply_url && (
          <a href={body.apply_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            Apply portal
            <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
          </a>
        )}
        {/* The stored copy first, then the region's PDF, then the page it
            sits on — resolved in scholarshipCallLink so the student's own
            Scholarship tab cannot end up showing a different paper. */}
        {call && (
          <a href={call.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            {call.kind === "page" ? (
              <Link2 aria-hidden className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <FileText aria-hidden className="h-3.5 w-3.5 shrink-0" />
            )}
            {call.label}
            {call.kind !== "stored" && <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />}
          </a>
        )}
        {body.source_url && (
          <a href={body.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:underline">
            {new URL(body.source_url).hostname.replace(/^www\./, "")}
            <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
          </a>
        )}
        {/* Said here rather than left blank: the call is what the student is
            sent, and a counselor cannot send what nobody has linked. */}
        {!call && body.call_status !== "awaiting" && (
          <span className="text-muted">
            {student
              ? "This year's call is not published yet — your counsellor will tell you when it opens."
              : <>No call linked — add one in Setup &rsaquo; Scholarship bodies</>}
          </span>
        )}
      </div>

      {open && (
        <div className="flex flex-col divide-y divide-border border-t border-border">
          {sections.map((s, i) => (
            <div key={i} className="px-3 py-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{s.title}</p>
              {/* whitespace-pre-line: the guides are written as lists of lines
                  and collapsing them would run the deadlines together. */}
              <p className="whitespace-pre-line text-xs leading-relaxed text-ink">{s.body}</p>
            </div>
          ))}
          <p className="px-3 py-2 text-[11px] text-muted">
            A summary for guidance. The official call is what governs — always check it before advising a student.
          </p>
        </div>
      )}
    </div>
  );
}
