"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { activateJourney, createJourney, deleteJourney, pauseJourney, saveJourney } from "@/lib/actions/emailJourneys";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { MAX_STEPS, STEP_CONDITIONS, TRIGGERS, stepWhen, type StepCondition, type Trigger } from "@/lib/emailCampaigns/journeys";

const label = "flex flex-col gap-1 text-xs text-muted";

export function NewJourneyForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createJourney, undefined);
  useEffect(() => {
    if (state && "success" in state && state.journeyId) router.push(`/marketing/email/automations/${state.journeyId}`);
  }, [state, router]);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end" data-new-journey>
      <label className={`${label} flex-1`}>
        Name
        <Input name="name" required maxLength={120} placeholder="e.g. Welcome series for new leads" />
      </label>
      <label className={label}>
        Starts when
        <Select name="trigger" defaultValue="new_lead">
          {(Object.keys(TRIGGERS) as Trigger[]).map((t) => (
            <option key={t} value={t}>
              {TRIGGERS[t].label}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit" variant="primary" pending={pending}>
        New automation
      </Button>
      {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

type Draft = { day: string; condition: StepCondition; subject: string; preheader: string; template_version_id: string };

export function JourneyEditor({
  journey,
  steps,
  templates,
  stages,
  topics,
  canEdit,
}: {
  journey: { id: string; name: string; trigger: Trigger; status: string; topic: string | null; stages: string[] };
  steps: { day: number; condition: StepCondition; subject: string; preheader: string | null; template_version_id: string | null }[];
  templates: { versionId: string; name: string }[];
  stages: { key: string; label: string }[];
  topics: { key: string; label: string }[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveJourney.bind(null, journey.id), undefined);
  const countdown = TRIGGERS[journey.trigger].countdown;
  const [drafts, setDrafts] = useState<Draft[]>(
    steps.length
      ? steps.map((s) => ({ day: String(countdown ? -s.day : s.day), condition: s.condition, subject: s.subject, preheader: s.preheader ?? "", template_version_id: s.template_version_id ?? "" }))
      : [{ day: countdown ? "7" : "0", condition: "always", subject: "", preheader: "", template_version_id: "" }]
  );
  const locked = journey.status === "active" || !canEdit;
  const update = (i: number, d: Partial<Draft>) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, ...d } : x)));
  const payload = JSON.stringify(drafts.map((d) => ({ ...d, day: countdown ? -Number(d.day || 0) : Number(d.day || 0) })));

  return (
    <form action={action} className="flex flex-col gap-5" data-journey-editor>
      <input type="hidden" name="steps" value={payload} />
      <fieldset disabled={locked} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={label}>
            Name
            <Input name="name" defaultValue={journey.name} required maxLength={120} />
          </label>
          <label className={label}>
            Topic <span className="text-[10px]">(people who opted out of it are not emailed)</span>
            <Select name="topic" defaultValue={journey.topic ?? ""}>
              <option value="">No particular topic</option>
              {topics.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <p className="text-xs text-muted">
          <span className="font-medium text-ink">Starts when:</span> {TRIGGERS[journey.trigger].label}. {TRIGGERS[journey.trigger].hint}
        </p>
        {journey.trigger === "application_stage" && (
          <div className={label}>
            Which stages
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2" data-journey-stages>
              {stages.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-xs text-ink">
                  <input type="checkbox" name="stages" value={s.key} defaultChecked={journey.stages.includes(s.key)} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-ink">The emails</h3>
          {drafts.map((d, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3" data-journey-step>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-ink">
                  Email {i + 1} — {stepWhen(countdown ? -Number(d.day || 0) : Number(d.day || 0), journey.trigger)}
                </p>
                {!locked && drafts.length > 1 && (
                  <button type="button" className="text-xs text-danger hover:underline" onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <label className={label}>
                  {countdown ? "Days before" : "Days after"}
                  <Input type="number" min={0} max={countdown ? 60 : 365} value={d.day} onChange={(e) => update(i, { day: e.target.value })} aria-label="Days" />
                </label>
                <label className={label}>
                  Goes
                  <Select value={d.condition} onChange={(e) => update(i, { condition: e.target.value as StepCondition })} aria-label="When it goes" disabled={i === 0}>
                    {(Object.keys(STEP_CONDITIONS) as StepCondition[]).map((c) => (
                      <option key={c} value={c}>
                        {STEP_CONDITIONS[c]}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className={`${label} sm:col-span-2`}>
                  Subject line
                  <Input value={d.subject} onChange={(e) => update(i, { subject: e.target.value })} maxLength={200} aria-label="Subject" placeholder="e.g. Welcome to HMARK, {{first_name|there}}" />
                </label>
                <label className={label}>
                  Preview text
                  <Input value={d.preheader} onChange={(e) => update(i, { preheader: e.target.value })} maxLength={250} aria-label="Preview text" />
                </label>
                <label className={label}>
                  Template
                  <Select value={d.template_version_id} onChange={(e) => update(i, { template_version_id: e.target.value })} aria-label="Template">
                    <option value="">Choose a template…</option>
                    {templates.map((t) => (
                      <option key={t.versionId} value={t.versionId}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </div>
          ))}
          {!locked && drafts.length < MAX_STEPS && (
            <div>
              <Button
                type="button"
                size="sm"
                data-add-step
                onClick={() =>
                  setDrafts((all) => [
                    ...all,
                    { day: String(countdown ? Math.max(0, Number(all.at(-1)?.day ?? 1) - 3) : Number(all.at(-1)?.day ?? 0) + 3), condition: "always", subject: "", preheader: "", template_version_id: "" },
                  ])
                }
              >
                Add an email
              </Button>
            </div>
          )}
        </div>
      </fieldset>
      {journey.status === "active" ? (
        <p className="text-xs text-muted">Pause it to change it. People already on their way carry on from where they are when it is resumed.</p>
      ) : (
        canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Saved." }}>
              Save
            </Button>
            {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
          </div>
        )
      )}
    </form>
  );
}

export function JourneyControls({ journeyId, status, canSend, canDelete }: { journeyId: string; status: string; canSend: boolean; canDelete: boolean }) {
  const router = useRouter();
  const b = useButtonAction();
  const run = async (fn: () => Promise<{ error?: string; success?: boolean; message?: string }>, after?: () => void) => {
    const r = await b.run(fn);
    if (r && !("error" in r && r.error)) (after ?? (() => router.refresh()))();
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-journey-controls>
      {canSend && status !== "active" && (
        <Button variant="primary" size="sm" pending={b.pending} status={{ state: b.state, label: "Done.", showError: true }} onClick={() => run(() => activateJourney(journeyId))} data-journey-activate>
          {status === "paused" ? "Resume" : "Switch it on"}
        </Button>
      )}
      {canSend && status === "active" && (
        <Button size="sm" pending={b.pending} status={{ state: b.state, label: "Done.", showError: true }} onClick={() => run(() => pauseJourney(journeyId))} data-journey-pause>
          Pause
        </Button>
      )}
      {canDelete && status === "draft" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm("Delete this automation?")) run(() => deleteJourney(journeyId), () => router.push("/marketing/email/automations"));
          }}
        >
          Delete
        </Button>
      )}
    </div>
  );
}
