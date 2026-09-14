"use client";

import { useState } from "react";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useFormAction } from "@/components/useFormAction";
import { startNewCycle } from "@/lib/actions/intakeCycles";
import { ReengagementDraft } from "./ReengagementDraft";
import type { ReengagementContext } from "@/lib/actions/reengagement";
import type { RestartContext } from "@/lib/actions/intakeCycles";

/**
 * Starting a student's process again, after a refusal or a disappearance.
 *
 * Deliberately a checkbox first and a form second: the office asked for "a box
 * to tick on the dashboard", and this must not sit open on the dashboard of
 * every refused student inviting an accidental second intake. Ticking it shows
 * what the system thinks and why, and staff confirm or override.
 *
 * The recommendation is presented as a recommendation. Almost no program in
 * the system has a deadline recorded, so the honest thing is to show what it
 * looked at — including when that was nothing — rather than to present a guess
 * as a decision.
 */
export function RestartProcessPanel({
  studentId,
  context,
  canEdit,
  reengagement,
}: {
  studentId: string;
  context: RestartContext;
  canEdit: boolean;
  reengagement?: ReengagementContext | null;
}) {
  const { eligibility, recommendation, currentIntake, deadlines, cycles } = context;
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"resumed" | "deferred">(
    recommendation.action === "resume" ? "resumed" : "deferred"
  );
  const [intake, setIntake] = useState(recommendation.intake || currentIntake);
  const { onSubmit, pending, error, success } = useFormAction(startNewCycle);

  if (!eligibility) return null;

  const attempt = cycles.length + 1;
  const reasonLabel =
    eligibility.reason === "visa_refused" ? "Visa refused" : eligibility.reason === "ghost" ? "Ghosted" : "Withdrawn";

  // Switching between resume and defer changes which intake makes sense, so
  // the field follows unless staff have typed something of their own.
  function chooseDecision(next: "resumed" | "deferred") {
    setDecision(next);
    const suggested = next === "resumed" ? currentIntake : recommendation.intake;
    if (suggested) setIntake(suggested);
  }

  return (
    <div className="mb-6 rounded-lg border border-warning bg-warning-bg p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="warning">{reasonLabel}</Badge>
        <h3 className="text-sm font-semibold text-ink">Start the process again?</h3>
      </div>
      <p className="mb-3 text-sm text-muted">
        {eligibility.detail} If they want to try again, open a new intake for them. Everything already in the portal
        stays — their documents, their profile, and last intake&rsquo;s applications under their own tab.
      </p>

      {/* Reaching them comes before restarting them: a ghosted student cannot
          ask for a new intake until somebody gets hold of them. */}
      {reengagement && (
        <ReengagementDraft
          // Keyed on which message it is, so switching a student from ghosted
          // to withdrawn rebuilds the draft. The subject and body are editable,
          // so they live in state seeded from these props — and React does not
          // reseed state when props change, which left the chase message in the
          // box for a student who had just been marked withdrawn. Caught on
          // production: the counsellor would have sent the wrong one.
          key={reengagement.draft?.kind ?? "none"}
          studentId={studentId}
          draft={reengagement.draft}
          studentEmail={reengagement.studentEmail}
          contactNumber={reengagement.contactNumber}
          templatesMissing={reengagement.templatesMissing}
        />
      )}

      {success ? (
        <p className="text-sm font-medium text-success">
          A new intake is open. Their previous applications are under the second tab in Applications and Documents.
        </p>
      ) : !open ? (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={false}
            onChange={() => setOpen(true)}
            disabled={!canEdit}
            className="h-4 w-4"
          />
          {canEdit
            ? "Start this student's process again for another intake"
            : "Only staff with permission can start a student's process again"}
        </label>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input type="hidden" name="student_id" value={studentId} />
          <input type="hidden" name="reason" value={eligibility.reason} />

          {/* What the recommendation is built on, so staff can disagree with
              it on the evidence rather than on faith. */}
          <div className="rounded-md border border-border bg-surface p-3">
            <p className="text-xs font-medium text-ink">
              Recommended: {recommendation.action === "resume" ? "resume this intake" : "defer to the next intake"}
            </p>
            <p className="mt-1 text-xs text-muted">{recommendation.because}</p>
            {deadlines.length > 0 && (
              <ul className="mt-2 flex flex-col gap-0.5">
                {deadlines.map((d, i) => (
                  <li key={`${d.label}-${i}`} className="text-[11px] text-muted">
                    {d.label}: {d.date ?? "not recorded"}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex flex-col gap-1 text-xs text-muted">
            This new intake
            <Select name="decision" value={decision} onChange={(e) => chooseDecision(e.target.value as "resumed" | "deferred")}>
              <option value="resumed">Resumes the current intake — there is still time</option>
              <option value="deferred">Defers to the next intake</option>
            </Select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Intake
            <Input
              name="intake"
              value={intake}
              onChange={(e) => setIntake(e.target.value)}
              placeholder="e.g. September/Fall 2028"
              maxLength={120}
            />
            {/* A country that runs several intakes a year cannot have this
                worked out for it, so it is left to be typed. */}
            {!recommendation.intake && decision === "deferred" && (
              <span className="text-[11px] text-warning">
                This country runs more than one intake a year, so type the one they are going for.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Note (optional)
            <Textarea name="note" rows={2} maxLength={2000} placeholder="Anything the next person should know about why" />
          </label>

          <p className="text-[11px] text-muted">
            Attempt {attempt}. The visa details, the scholarship and the scholarship documents are not carried across —
            they belong to the attempt that ended. Documents already approved carry over unless the requirement is
            marked to be renewed each intake in Setup.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending || !intake.trim()}>
              {pending ? "Opening…" : "Open the new intake"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
