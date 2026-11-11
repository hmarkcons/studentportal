"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveEmailCampaign,
  changeEmailCampaignState,
  createEmailCampaign,
  deleteEmailCampaign,
  duplicateEmailCampaign,
  previewEmailCampaignAudience,
  rejectEmailCampaign,
  saveEmailCampaign,
  scheduleEmailCampaign,
  sendEmailCampaignNow,
  sendEmailCampaignTest,
  simulateEmailCampaignActivity,
  clearSimulatedEmailCampaignActivity,
  submitEmailCampaignForApproval,
  type AudienceSummary,
} from "@/lib/actions/emailCampaigns";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

const label = "flex flex-col gap-1 text-xs text-muted";

export function NewCampaignForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createEmailCampaign, undefined);
  useEffect(() => {
    if (state && "success" in state) router.push(`/marketing/email/campaigns/${state.campaignId}`);
  }, [state, router]);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end" data-new-campaign>
      <label className={`${label} flex-1`}>
        Campaign name <span className="text-[10px]">(for you; recipients never see it)</span>
        <Input name="name" required maxLength={120} placeholder="e.g. Italy scholarships — November 2026" />
      </label>
      <Button type="submit" variant="primary" pending={pending}>
        New campaign
      </Button>
      {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export type EditorCampaign = {
  id: string;
  name: string;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  subject: string | null;
  preheader: string | null;
  template_version_id: string | null;
  topic: string | null;
  track_opens: boolean;
  track_clicks: boolean;
  add_utm: boolean;
  audience: { include: { all: boolean; segments: string[]; lists: string[] }; exclude: { segments: string[]; lists: string[] }; skipLeadStatuses: string[] };
};

type Option = { id: string; name: string; note?: string };

function Checks({ name, options, chosen }: { name: string; options: Option[]; chosen: string[] }) {
  if (!options.length) return <p className="text-[11px] text-muted">None yet.</p>;
  return (
    <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" name={name} value={o.id} defaultChecked={chosen.includes(o.id)} />
          {o.name}
          {o.note && <span className="text-muted">{o.note}</span>}
        </label>
      ))}
    </div>
  );
}

/** The campaign's draft: who it is from, what it says, who it goes to, how it is tracked. */
export function CampaignEditor({
  campaign,
  templates,
  segments,
  lists,
  topics,
}: {
  campaign: EditorCampaign;
  templates: { versionId: string; name: string; note?: string }[];
  segments: Option[];
  lists: Option[];
  topics: { key: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(saveEmailCampaign.bind(null, campaign.id), undefined);
  const [subject, setSubject] = useState(campaign.subject ?? "");
  const [preheader, setPreheader] = useState(campaign.preheader ?? "");
  const [reach, setReach] = useState<AudienceSummary | null>(null);
  const [counting, setCounting] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const recount = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!form.current) return;
      setCounting(true);
      const r = await previewEmailCampaignAudience(new FormData(form.current));
      setCounting(false);
      if (!("error" in r)) setReach(r);
    }, 500);
  };
  useEffect(() => {
    recount();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Once on opening; afterwards on each change of the audience fields.
  }, []);
  useEffect(() => {
    if (state && "success" in state) router.refresh();
  }, [state, router]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-6" data-campaign-editor>
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-ink">1. Name and sender</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={label}>
            Campaign name
            <Input name="name" defaultValue={campaign.name} required maxLength={120} />
          </label>
          <label className={label}>
            Sender name
            <Input name="from_name" defaultValue={campaign.from_name ?? ""} maxLength={80} placeholder="HMARK Consultants" />
          </label>
          <label className={label}>
            Sender address <span className="text-[10px]">(on the verified sending domain, once connected)</span>
            <Input name="from_email" type="email" defaultValue={campaign.from_email ?? ""} placeholder="news@news.hmarkconsultants.com" />
          </label>
          <label className={label}>
            Reply-to
            <Input name="reply_to" type="email" defaultValue={campaign.reply_to ?? ""} placeholder="info@hmarkconsultants.com" />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-ink">2. Subject and content</h3>
        <label className={label}>
          <span className="flex justify-between">
            Subject line <span className={subject.length > 60 ? "text-warning" : ""}>{subject.length}/200{subject.length > 60 ? " — long subjects are cut off on phones" : ""}</span>
          </span>
          <Input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="e.g. 🎓 {{first_name|Hello}}, Italy scholarships are open" data-campaign-subject />
        </label>
        <label className={label}>
          <span className="flex justify-between">
            Preview text <span>{preheader.length}/250</span>
          </span>
          <Input name="preheader" value={preheader} onChange={(e) => setPreheader(e.target.value)} maxLength={250} placeholder="The line shown after the subject in the inbox" />
        </label>
        <label className={label}>
          Template
          <Select name="template_version_id" defaultValue={campaign.template_version_id ?? ""} data-campaign-template>
            <option value="">Choose a template…</option>
            {templates.map((t) => (
              <option key={t.versionId} value={t.versionId}>
                {t.name}
                {t.note ? ` — ${t.note}` : ""}
              </option>
            ))}
          </Select>
        </label>
      </section>

      <section className="flex flex-col gap-3" onChange={recount}>
        <h3 className="text-sm font-medium text-ink">3. Audience</h3>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="include_all" defaultChecked={campaign.audience.include.all} data-campaign-everyone />
          Everyone with an email address
        </label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className={label}>
            Send to these segments
            <Checks name="include_segments" options={segments} chosen={campaign.audience.include.segments} />
          </div>
          <div className={label}>
            and these lists
            <Checks name="include_lists" options={lists} chosen={campaign.audience.include.lists} />
          </div>
          <div className={label}>
            Leave out these segments
            <Checks name="exclude_segments" options={segments} chosen={campaign.audience.exclude.segments} />
          </div>
          <div className={label}>
            Leave out these lists
            <Checks name="exclude_lists" options={lists} chosen={campaign.audience.exclude.lists} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-ink">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="skip_status" value="not_interested" defaultChecked={campaign.audience.skipLeadStatuses.includes("not_interested")} />
            Leave out leads marked Not interested
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="skip_status" value="not_eligible" defaultChecked={campaign.audience.skipLeadStatuses.includes("not_eligible")} />
            Leave out leads marked Not eligible
          </label>
        </div>
        <label className={`${label} sm:max-w-sm`}>
          Topic <span className="text-[10px]">(people who opted out of it on their preference page are left out)</span>
          <Select name="topic" defaultValue={campaign.topic ?? ""}>
            <option value="">No particular topic</option>
            {topics.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
        <div className="rounded-md bg-bg p-3 text-xs" data-campaign-reach>
          <p className="text-sm text-ink">
            Reaches <span className="font-semibold">{reach ? reach.counts.final.toLocaleString("en-US") : "…"}</span> people now
            {counting && <span className="ml-2 text-muted">counting…</span>}
          </p>
          {reach && <p className="text-muted">{reach.lines.join(" · ")}</p>}
          <p className="mt-1 text-[11px] text-muted">The audience is frozen when the campaign starts; who it reaches may change until then.</p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">4. Tracking</h3>
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" name="track_opens" defaultChecked={campaign.track_opens} /> Track opens (an invisible image in the email)
        </label>
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" name="track_clicks" defaultChecked={campaign.track_clicks} /> Track clicks (links go through the portal first)
        </label>
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" name="add_utm" defaultChecked={campaign.add_utm} /> Add UTM tags to links (utm_source=hmark_portal, utm_medium=email)
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="submit" variant="primary" pending={pending} status={{ state, label: state && "success" in state ? (state.message ?? "Saved.") : "Saved." }}>
          Save draft
        </Button>
      </div>
    </form>
  );
}

/** Checks, a test, and going: now, at a time, or to the approvers. */
export function CampaignSendPanel({
  campaignId,
  problems,
  reach,
  realSend,
  rights,
  confirmAbove,
  defaultTestTo,
}: {
  campaignId: string;
  problems: string[];
  reach: number;
  realSend: boolean;
  rights: { send: boolean; create: boolean };
  confirmAbove: number;
  defaultTestTo: string;
}) {
  const router = useRouter();
  const [nowState, nowAction, nowPending] = useActionState(sendEmailCampaignNow.bind(null, campaignId), undefined);
  const [schedState, schedAction, schedPending] = useActionState(scheduleEmailCampaign.bind(null, campaignId), undefined);
  const [askState, askAction, askPending] = useActionState(submitEmailCampaignForApproval.bind(null, campaignId), undefined);
  const [testState, testAction, testPending] = useActionState(sendEmailCampaignTest.bind(null, campaignId), undefined);
  useEffect(() => {
    if ([nowState, schedState, askState].some((s) => s && "success" in s)) router.refresh();
  }, [nowState, schedState, askState, router]);
  const needsConfirm = reach > confirmAbove;
  const ready = problems.length === 0;
  const message = (s: unknown) => {
    const r = s as { error?: string; message?: string; success?: boolean } | undefined;
    if (!r) return null;
    return r.error ? <p className="text-xs text-danger">{r.error}</p> : r.message ? <p className="text-xs text-success">{r.message}</p> : null;
  };

  return (
    <div className="flex flex-col gap-4" data-campaign-send>
      <div>
        <h3 className="mb-2 text-sm font-medium text-ink">Before it goes</h3>
        {ready ? (
          <p className="text-xs text-success" data-campaign-ready>
            ✓ Ready — to {reach.toLocaleString("en-US")} people.
          </p>
        ) : (
          <ul className="list-disc pl-4 text-xs text-danger" data-campaign-problems>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {!realSend && (
          <p className="mt-2 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
            No sending service is connected, so sending is a <strong>practice run</strong>: every step happens, nothing leaves the
            portal, and the campaign is marked Practice.
          </p>
        )}
      </div>

      <form action={testAction} className="flex flex-col gap-2 rounded-md border border-border p-3">
        <p className="text-xs font-medium text-ink">Send a test</p>
        <Input name="to" defaultValue={defaultTestTo} placeholder="you@hmarkconsultants.com (up to 5, comma-separated)" />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="outline-primary" pending={testPending}>
            Send test
          </Button>
          {message(testState)}
        </div>
      </form>

      {rights.send ? (
        <>
          <form action={nowAction} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium text-ink">Send now</p>
            {needsConfirm && (
              <label className={label}>
                Type {reach} (or SEND) to confirm a send to {reach.toLocaleString("en-US")} people
                <Input name="confirm" autoComplete="off" data-campaign-confirm />
              </label>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" pending={nowPending} disabled={!ready} data-campaign-send-now>
                {realSend ? "Send now" : "Send now (practice)"}
              </Button>
              {message(nowState)}
            </div>
          </form>
          <form action={schedAction} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium text-ink">Or schedule it</p>
            <label className={label}>
              Date and time (Karachi)
              <Input name="scheduled_at" type="datetime-local" required />
            </label>
            {needsConfirm && (
              <label className={label}>
                Type {reach} (or SEND) to confirm
                <Input name="confirm" autoComplete="off" />
              </label>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" pending={schedPending} disabled={!ready}>
                Schedule
              </Button>
              {message(schedState)}
            </div>
          </form>
        </>
      ) : rights.create ? (
        <form action={askAction} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-xs font-medium text-ink">Send for approval</p>
          <p className="text-[11px] text-muted">You can draft campaigns; someone allowed to approve them sends it.</p>
          <label className={label}>
            When it should go (Karachi) <span className="text-[10px]">(optional — blank is as soon as it is approved)</span>
            <Input name="scheduled_at" type="datetime-local" />
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" pending={askPending} disabled={!ready}>
              Send for approval
            </Button>
            {message(askState)}
          </div>
        </form>
      ) : null}
    </div>
  );
}

/** One button that runs an action, says how it went, and refreshes the page. */
function ActionButton({
  run: action,
  children,
  variant = "outline",
  confirmText,
  after,
}: {
  run: () => Promise<{ error?: string; success?: boolean; message?: string; campaignId?: string }>;
  children: React.ReactNode;
  variant?: "outline" | "primary" | "danger" | "ghost" | "outline-primary";
  confirmText?: string;
  after?: (r: { campaignId?: string }) => void;
}) {
  const router = useRouter();
  const b = useButtonAction();
  return (
    <Button
      size="sm"
      variant={variant}
      pending={b.pending}
      status={{ state: b.state, label: "Done.", showError: true }}
      onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        const r = await b.run(action);
        if (r && !("error" in r && r.error)) {
          if (after) after(r as { campaignId?: string });
          else router.refresh();
        }
      }}
    >
      {children}
    </Button>
  );
}

export function CampaignControls({
  campaignId,
  status,
  practice,
  canSend,
  canApprove,
  canCreate,
  hasSimulated,
}: {
  campaignId: string;
  status: string;
  practice: boolean;
  canSend: boolean;
  canApprove: boolean;
  canCreate: boolean;
  hasSimulated: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-3" data-campaign-controls>
      {status === "pending_approval" && canApprove && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-xs font-medium text-ink">Review</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="primary" run={() => approveEmailCampaign(campaignId)}>
              Approve
            </ActionButton>
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs changing (to send it back)" />
          <div>
            <ActionButton variant="danger" run={() => rejectEmailCampaign(campaignId, note)}>
              Send back
            </ActionButton>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {canSend && status === "sending" && <ActionButton run={() => changeEmailCampaignState(campaignId, "paused")}>Pause</ActionButton>}
        {canSend && status === "paused" && (
          <ActionButton variant="primary" run={() => changeEmailCampaignState(campaignId, "sending")}>
            Resume
          </ActionButton>
        )}
        {canSend && status === "scheduled" && <ActionButton run={() => changeEmailCampaignState(campaignId, "draft")}>Back to draft</ActionButton>}
        {canSend && ["sending", "paused", "scheduled"].includes(status) && (
          <ActionButton variant="danger" confirmText="Cancel this campaign? No more of its emails will go." run={() => changeEmailCampaignState(campaignId, "cancelled")}>
            Cancel campaign
          </ActionButton>
        )}
        {canSend && practice && !hasSimulated && ["sent", "sending", "paused", "cancelled"].includes(status) && (
          <ActionButton variant="outline-primary" run={() => simulateEmailCampaignActivity(campaignId)}>
            Simulate activity (practice)
          </ActionButton>
        )}
        {canSend && practice && hasSimulated && (
          <ActionButton variant="ghost" confirmText="Take the made-up activity away?" run={() => clearSimulatedEmailCampaignActivity(campaignId)}>
            Clear simulated activity
          </ActionButton>
        )}
        {canCreate && (
          <ActionButton run={() => duplicateEmailCampaign(campaignId)} after={(r) => r.campaignId && router.push(`/marketing/email/campaigns/${r.campaignId}`)}>
            Duplicate
          </ActionButton>
        )}
        {canCreate && ["draft", "pending_approval"].includes(status) && (
          <ActionButton variant="ghost" confirmText="Delete this draft?" run={() => deleteEmailCampaign(campaignId)} after={() => router.push("/marketing/email/campaigns")}>
            Delete draft
          </ActionButton>
        )}
      </div>
    </div>
  );
}

/** Keeps a sending campaign's page current. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [seconds, router]);
  return null;
}
