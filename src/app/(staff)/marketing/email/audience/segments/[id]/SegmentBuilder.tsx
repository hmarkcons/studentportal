"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteEmailSegment, previewSegmentAudience, saveEmailSegment, type AudiencePreview } from "@/lib/actions/emailAudience";
import { CONTACT_STATUS_LABELS, FIELDS, OP_LABELS, suppressedTotal, type ContactStatus, type FieldKey, type Op, type OptionSource, type Rule, type RuleSet } from "@/lib/emailCampaigns/audience";
import type { FieldOption } from "@/lib/emailCampaigns/audienceLoad";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";

type Draft = { field: FieldKey; op: Op; values: string[]; text: string };

const MULTI: Op[] = ["is_any", "is_none", "contains_any", "contains_none"];
const NONE: Op[] = ["is_empty", "is_not_empty", "is_true", "is_false"];

function toDraft(r: Rule): Draft {
  return { field: r.field, op: r.op, values: Array.isArray(r.value) ? r.value : [], text: Array.isArray(r.value) || r.value == null ? "" : String(r.value) };
}

function toRule(d: Draft): Rule {
  if (MULTI.includes(d.op)) return { field: d.field, op: d.op, value: d.values };
  if (NONE.includes(d.op)) return { field: d.field, op: d.op };
  if (d.op === "within_days" || d.op === "older_than_days") return { field: d.field, op: d.op, value: Number(d.text) };
  return { field: d.field, op: d.op, value: d.text };
}

function ValuePicker({ draft, options, onChange }: { draft: Draft; options: FieldOption[]; onChange: (d: Draft) => void }) {
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const remaining = options.filter((o) => !draft.values.includes(o.value));
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
      {draft.values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-xs text-ink">
          {label(v)}
          <button type="button" aria-label={`Remove ${label(v)}`} className="text-muted hover:text-danger" onClick={() => onChange({ ...draft, values: draft.values.filter((x) => x !== v) })}>
            ×
          </button>
        </span>
      ))}
      <Select value="" onChange={(e) => e.target.value && onChange({ ...draft, values: [...draft.values, e.target.value] })} className="w-48" aria-label="Add a value">
        <option value="">{draft.values.length ? "Add another…" : "Choose…"}</option>
        {remaining.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.count !== undefined ? ` (${o.count})` : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function SegmentBuilder({
  segmentId,
  initialName,
  initialDescription,
  initialRules,
  options,
  canManage,
}: {
  segmentId: string | null;
  initialName: string;
  initialDescription: string;
  initialRules: RuleSet;
  options: Record<OptionSource, FieldOption[]>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [match, setMatch] = useState<"all" | "any">(initialRules.match);
  const [drafts, setDrafts] = useState<Draft[]>(initialRules.rules.map(toDraft));
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const rulesJson = useMemo(() => JSON.stringify({ match, rules: drafts.map(toRule) }), [match, drafts]);

  // A count and a sample, asked again once editing pauses.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setPreviewing(true);
      const r = await previewSegmentAudience(rulesJson);
      setPreviewing(false);
      if ("error" in r) {
        setPreviewError(r.error);
      } else {
        setPreviewError(null);
        setPreview(r);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [rulesJson]);

  const [state, action, pending] = useActionState(saveEmailSegment.bind(null, segmentId), undefined);
  useEffect(() => {
    if (state && "success" in state && !segmentId) router.push(`/marketing/email/audience/segments/${state.segmentId}`);
  }, [state, segmentId, router]);
  const remove = useButtonAction();

  const update = (i: number, d: Draft) => setDrafts((all) => all.map((x, j) => (j === i ? d : x)));
  const addRule = () => setDrafts((all) => [...all, { field: "country", op: "contains_any", values: [], text: "" }]);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <form action={action} className="flex flex-col gap-4" data-segment-builder>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Segment name
              <Input name="name" defaultValue={initialName} required maxLength={120} placeholder="e.g. Italy, masters, Karachi" disabled={!canManage} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Description <span className="text-[10px]">(optional)</span>
              <Input name="description" defaultValue={initialDescription} maxLength={500} disabled={!canManage} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
            A contact is in the segment when they match
            <Select value={match} onChange={(e) => setMatch(e.target.value as "all" | "any")} className="w-24" aria-label="Match" disabled={!canManage}>
              <option value="all">all</option>
              <option value="any">any</option>
            </Select>
            of these rules{drafts.length === 0 ? " — with none, everyone is in it." : ":"}
          </div>

          <ul className="flex flex-col gap-2">
            {drafts.map((d, i) => {
              const def = FIELDS[d.field];
              return (
                <li key={i} className="flex flex-col gap-2 rounded-md border border-border p-2 sm:flex-row sm:items-start" data-segment-rule>
                  <Select
                    value={d.field}
                    onChange={(e) => {
                      const field = e.target.value as FieldKey;
                      update(i, { field, op: FIELDS[field].ops[0], values: [], text: "" });
                    }}
                    className="sm:w-48"
                    aria-label="Field"
                    disabled={!canManage}
                  >
                    {(Object.keys(FIELDS) as FieldKey[]).map((f) => (
                      <option key={f} value={f}>
                        {FIELDS[f].label}
                      </option>
                    ))}
                  </Select>
                  <Select value={d.op} onChange={(e) => update(i, { ...d, op: e.target.value as Op })} className="sm:w-44" aria-label="Comparison" disabled={!canManage}>
                    {def.ops.map((o) => (
                      <option key={o} value={o}>
                        {OP_LABELS[o]}
                      </option>
                    ))}
                  </Select>
                  {MULTI.includes(d.op) && def.options && <ValuePicker draft={d} options={options[def.options]} onChange={(n) => update(i, n)} />}
                  {(d.op === "within_days" || d.op === "older_than_days") && (
                    <Input type="number" min={1} max={3650} value={d.text} onChange={(e) => update(i, { ...d, text: e.target.value })} className="sm:w-28" placeholder="Days" disabled={!canManage} />
                  )}
                  {(d.op === "after" || d.op === "before") && (
                    <Input type="date" value={d.text} onChange={(e) => update(i, { ...d, text: e.target.value })} className="sm:w-44" disabled={!canManage} />
                  )}
                  {d.op === "contains" && <Input value={d.text} onChange={(e) => update(i, { ...d, text: e.target.value })} className="sm:w-56" placeholder="e.g. 2027" disabled={!canManage} />}
                  {canManage && (
                    <button type="button" onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))} className="text-xs text-danger hover:underline sm:ml-auto">
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {canManage && (
            <div>
              <Button type="button" size="sm" onClick={addRule} data-add-rule>
                Add a rule
              </Button>
            </div>
          )}

          <input type="hidden" name="rules" value={rulesJson} />
          {canManage && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Saved." }}>
                {segmentId ? "Save segment" : "Create segment"}
              </Button>
              {segmentId && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  pending={remove.pending}
                  status={{ state: remove.state, label: "Deleted.", showError: true }}
                  onClick={async () => {
                    if (!confirm("Delete this segment? Campaigns already sent keep who they went to.")) return;
                    const r = await remove.run(() => deleteEmailSegment(segmentId));
                    if (r && "success" in r) router.push("/marketing/email/audience/segments");
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
          )}
        </form>
      </Card>

      <Card>
        <div data-segment-preview>
          <p className="text-[11px] uppercase tracking-wide text-muted">Reaches now</p>
          <p className="text-3xl font-semibold text-ink" data-segment-count>
            {preview ? preview.counts.final.toLocaleString("en-US") : "…"}
            {previewing && <span className="ml-2 text-xs font-normal text-muted">counting…</span>}
          </p>
          {previewError && <p className="mt-1 text-xs text-danger">{previewError}</p>}
          {preview && (
            <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted">
              <li>{preview.counts.matched.toLocaleString("en-US")} records match the rules</li>
              {preview.counts.duplicates > 0 && <li>− {preview.counts.duplicates} with an address already counted</li>}
              {preview.counts.invalid > 0 && <li>− {preview.counts.invalid} with no usable address</li>}
              {preview.counts.skippedLeadStatus > 0 && <li>− {preview.counts.skippedLeadStatus} marked Not interested or Not eligible</li>}
              {suppressedTotal(preview.counts) > 0 && (
                <li>
                  − {suppressedTotal(preview.counts)} on the do-not-email list (
                  {(Object.entries(preview.counts.suppressed) as [ContactStatus, number][]).map(([s, n]) => `${CONTACT_STATUS_LABELS[s].toLowerCase()} ${n}`).join(", ")})
                </li>
              )}
            </ul>
          )}
          {preview && preview.sample.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium text-ink">The first {preview.sample.length}</p>
              <ul className="flex flex-col gap-1 text-xs">
                {preview.sample.map((p) => (
                  <li key={p.email} className="truncate">
                    <span className="text-ink">{p.name}</span> <span className="text-muted">{p.email}</span>
                    {p.kind === "contact" && <span className="text-muted"> · imported</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
