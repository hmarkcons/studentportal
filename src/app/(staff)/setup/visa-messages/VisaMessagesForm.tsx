"use client";

import { useState } from "react";
import { updateVisaMessages } from "@/lib/actions/visaMessages";
import { useFormAction } from "@/components/useFormAction";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { fillVisaTemplate, splitParagraphs } from "@/lib/visaOutcome";

export type VisaMessageRow = {
  approved_heading: string;
  approved_body: string;
  approved_signoff: string;
  refused_heading: string;
  refused_body: string;
  refused_signoff: string;
};

/** A real-looking student, so the preview reads like the real thing. */
const SAMPLE = { name: "Ahmed Raza", country: "Italy" };

function Preview({ heading, body, signoff, tone }: { heading: string; body: string; signoff: string; tone: "approved" | "refused" }) {
  const cls = tone === "approved" ? "text-success" : "text-warning";
  const border = tone === "approved" ? "border-success bg-success-bg" : "border-warning bg-warning-bg";
  return (
    <div className={`rounded-md border px-3 py-3 ${border}`}>
      <p className={`mb-2 text-sm font-semibold ${cls}`}>{fillVisaTemplate(heading, SAMPLE) || "—"}</p>
      {splitParagraphs(fillVisaTemplate(body, SAMPLE)).map((p, i) => (
        <p key={i} className={`mb-2 text-sm last:mb-0 ${cls}`}>
          {p}
        </p>
      ))}
      {signoff.trim() && <p className={`mt-3 text-xs ${cls}`}>— {signoff.trim()}</p>}
    </div>
  );
}

/**
 * The two messages, with what a student would actually read beside them.
 *
 * A preview rather than a Save-and-go-look: this is the only copy in the
 * portal that carries real news, it is read once, and the difference between
 * wording that lands and wording that stings is not visible in a textarea.
 */
export function VisaMessagesForm({ initial, canEdit }: { initial: VisaMessageRow; canEdit: boolean }) {
  const [v, setV] = useState<VisaMessageRow>(initial);
  const { onSubmit, pending, error, success } = useFormAction(updateVisaMessages);

  const set = (k: keyof VisaMessageRow) => (e: { target: { value: string } }) => setV((prev) => ({ ...prev, [k]: e.target.value }));

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">Only Management and Super Admin can change these. This is what students read today.</p>
        <Preview heading={v.approved_heading} body={v.approved_body} signoff={v.approved_signoff} tone="approved" />
        <Preview heading={v.refused_heading} body={v.refused_body} signoff={v.refused_signoff} tone="refused" />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <p className="text-xs text-muted">
        Write <span className="rounded bg-bg px-1 font-mono">{"{name}"}</span> for the student&rsquo;s first name and{" "}
        <span className="rounded bg-bg px-1 font-mono">{"{country}"}</span> for where they are going. Leave a blank line
        between paragraphs. If a student has no country finalised yet, the placeholder and its punctuation drop out
        rather than leaving a gap.
      </p>

      {([
        ["approved", "When a visa is issued", "approved_heading", "approved_body", "approved_signoff"],
        ["refused", "When a visa is refused", "refused_heading", "refused_body", "refused_signoff"],
      ] as const).map(([tone, title, hKey, bKey, sKey]) => (
        <Card key={tone}>
          <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Heading
                <Input name={hKey} value={v[hKey]} onChange={set(hKey)} maxLength={200} required />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Message
                <Textarea name={bKey} value={v[bKey]} onChange={set(bKey)} rows={10} maxLength={4000} required />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Signed
                <Input name={sKey} value={v[sKey]} onChange={set(sKey)} maxLength={120} placeholder="The HMARK team" />
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">What {SAMPLE.name.split(" ")[0]} would read</span>
              <Preview heading={v[hKey]} body={v[bKey]} signoff={v[sKey]} tone={tone} />
            </div>
          </div>
        </Card>
      ))}

      {error && <p className="rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      {success && <p className="rounded-md border border-success bg-success-bg px-3 py-2 text-sm text-success">Saved.</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" pending={pending}>
          Save messages
        </Button>
        <Button type="button" onClick={() => setV(initial)}>
          Undo my changes
        </Button>
      </div>
    </form>
  );
}
