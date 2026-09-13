"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  requestScholarshipUpdate,
  applyScholarshipProposal,
  dismissScholarshipProposal,
  processNextScholarshipUpdate,
  testScholarshipResearch,
} from "@/lib/actions/scholarshipUpdates";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export type UpdateRun = {
  id: string;
  bodyName: string;
  status: string;
  academic_year: string | null;
  notes: string | null;
  error: string | null;
  source_url: string | null;
  call_pdf_url: string | null;
  requested_at: string;
  proposal: Record<string, { from: unknown; to: unknown }> | null;
};

const FIELD_LABELS: Record<string, string> = {
  academic_year: "Academic year",
  application_deadline: "Application deadline",
  apply_url: "Apply portal",
  source_url: "Source",
  call_pdf_url: "Official call PDF",
  isee_threshold: "ISEE limit",
  ispe_threshold: "ISPE limit",
  stipend_amount: "Stipend / notes",
  benefits: "Benefits",
  covers: "Universities covered",
  guide_sections: "The guide",
};

function show(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (typeof value[0] === "object") {
      return (value as { title: string }[]).map((s, i) => `${i + 1}. ${s.title}`).join("\n");
    }
    return value.join(", ");
  }
  return String(value);
}

/**
 * One proposed update, field by field, with what it is replacing.
 *
 * Each field can be accepted on its own. A run usually gets most of it right
 * and one thing wrong, and an all-or-nothing choice means either taking the
 * wrong one or throwing away the rest.
 */
function Proposal({ run, onDone }: { run: UpdateRun; onDone: () => void }) {
  const fields = Object.keys(run.proposal ?? {});
  const [accepted, setAccepted] = useState<Set<string>>(new Set(fields));
  const [pending, setPending] = useState<"apply" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setPending("apply");
    setError(null);
    const result = await applyScholarshipProposal(run.id, [...accepted]);
    setPending(null);
    if (result?.error) setError(result.error);
    else onDone();
  }

  async function dismiss() {
    if (!confirm(`Reject the proposed changes for ${run.bodyName}?`)) return;
    setPending("dismiss");
    setError(null);
    const result = await dismissScholarshipProposal(run.id);
    setPending(null);
    if (result?.error) setError(result.error);
    else onDone();
  }

  return (
    <Card className="border-info">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink">
          {run.bodyName}
          {run.academic_year && <span className="ml-2 text-xs font-normal text-muted">for {run.academic_year}</span>}
        </span>
        <span className="flex items-center gap-2">
          {run.source_url && (
            <a href={run.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              source ↗
            </a>
          )}
          <Button type="button" size="sm" variant="primary" pending={pending === "apply"} onClick={apply}>
            Apply {accepted.size === fields.length ? "all" : `${accepted.size}`}
          </Button>
          <Button type="button" size="sm" pending={pending === "dismiss"} onClick={dismiss}>
            Reject
          </Button>
        </span>
      </div>

      <div className="flex flex-col divide-y divide-border">
        {fields.map((field) => {
          const change = run.proposal![field];
          return (
            <label key={field} className="flex items-start gap-2 py-2 text-xs">
              <input
                type="checkbox"
                checked={accepted.has(field)}
                onChange={(e) =>
                  setAccepted((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(field);
                    else next.delete(field);
                    return next;
                  })
                }
                className="mt-0.5 h-4 w-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{FIELD_LABELS[field] ?? field}</span>
                <span className="mt-0.5 block whitespace-pre-line text-muted line-through decoration-danger/50">
                  {show(change.from)}
                </span>
                <span className="mt-0.5 block whitespace-pre-line text-ink">{show(change.to)}</span>
              </span>
            </label>
          );
        })}
      </div>

      {/* What it was unsure about. Read before accepting — this is the part
          that says where to look. */}
      {run.notes && <p className="mt-2 whitespace-pre-line border-t border-border pt-2 text-[11px] text-muted">{run.notes}</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </Card>
  );
}

export function UpdateRunsPanel({
  runs,
  canManage,
  researchConfigured,
}: {
  runs: UpdateRun[];
  canManage: boolean;
  /** ANTHROPIC_API_KEY is set on the server. Without it nothing can be read. */
  researchConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  const proposed = runs.filter((r) => r.status === "proposed");
  const working = runs.filter((r) => r.status === "queued" || r.status === "running");
  const awaiting = runs.filter((r) => r.status === "awaiting");
  const failed = runs.filter((r) => r.status === "failed");

  /**
   * Queues the work, then drains it one body at a time from here.
   *
   * The plan this runs on allows daily crons only, so a scheduled worker would
   * mean clicking the button today and seeing the answer tomorrow. Driving it
   * from the page also means the office watches it happen instead of staring
   * at a spinner — each region takes most of a minute to read.
   */
  async function checkAll() {
    setPending(true);
    setError(null);
    setMessage(null);
    setProgress([]);

    const queued = await requestScholarshipUpdate(null);
    if (queued?.error) {
      setPending(false);
      setError(queued.error);
      return;
    }
    router.refresh();

    // A hard ceiling rather than "until empty": a bug that never drains the
    // queue would otherwise spend the office's money in a loop.
    for (let i = 0; i < 40; i++) {
      const step = await processNextScholarshipUpdate();
      if ("error" in step) {
        setError(step.error);
        break;
      }
      if (step.done) break;
      setProgress((prev) => [...prev, `${step.body || "…"} — ${step.outcome}`]);
      router.refresh();
      if (step.remaining === 0) break;
    }

    setPending(false);
    setMessage("Finished checking. Anything proposed is below, waiting for you.");
    router.refresh();
  }

  if (!canManage) return null;

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2">
        <div className="text-xs">
          <p className="font-medium text-ink">Check every body against its own website</p>
          <p className="text-muted">
            Reads each region&rsquo;s official call and proposes what changed. Nothing is written until you accept it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {working.length > 0 && (
            <Badge tone="info">
              {working.length} checking…
            </Badge>
          )}
          {/* Answered in a second for a fraction of a cent, instead of as
              twenty-one failed runs twenty minutes from now. */}
          <Button
            type="button"
            size="sm"
            pending={testing}
            onClick={async () => {
              setTesting(true);
              setError(null);
              setMessage(null);
              const result = await testScholarshipResearch();
              setTesting(false);
              if (result?.error) setError(result.error);
              else setMessage(`The key works — research runs on ${result.model}.`);
            }}
          >
            Test the key
          </Button>
          <Button type="button" variant="primary" size="sm" pending={pending} onClick={checkAll} disabled={!researchConfigured}>
            Check for updates
          </Button>
        </div>
      </div>

      {/* Said plainly rather than letting the button queue work nothing will
          ever pick up. */}
      {!researchConfigured && (
        <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
          Set <span className="font-mono">ANTHROPIC_API_KEY</span> in the Vercel project to turn this on, then redeploy —
          an environment variable only reaches a running page on a new deployment. Press <strong>Test the key</strong>
          afterwards to confirm before sweeping every body. Until then the guides are maintained by hand, which is what
          the Edit button is for.
        </p>
      )}

      {progress.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-card px-3 py-2 text-xs">
          {progress.map((line, i) => (
            <p key={i} className="text-muted">
              {line}
            </p>
          ))}
          {pending && <p className="text-primary">reading the next one…</p>}
        </div>
      )}
      {pending && progress.length === 0 && <p className="text-xs text-primary">Queuing, then reading the first one…</p>}

      {message && <p className="text-xs text-success">{message}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}

      {proposed.map((run) => (
        <Proposal key={run.id} run={run} onDone={() => router.refresh()} />
      ))}

      {awaiting.length > 0 && (
        <p className="rounded-md border border-info bg-info-bg px-3 py-2 text-xs text-info">
          Not published yet: {awaiting.map((r) => r.bodyName).join(", ")}. Each body carries the date it is expected.
        </p>
      )}

      {failed.length > 0 && (
        <p className="rounded-md border border-danger bg-danger-bg px-3 py-2 text-xs text-danger">
          Could not read: {failed.map((r) => `${r.bodyName} (${r.error ?? "unknown"})`).join("; ")}
        </p>
      )}
    </div>
  );
}
