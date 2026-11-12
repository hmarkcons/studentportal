"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { startSunsetNow, suppressSunsetNow, updateSunsetSettings } from "@/lib/actions/emailSunset";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function StartSunsetButton({ count, automatic }: { count: number; automatic: boolean }) {
  const router = useRouter();
  const b = useButtonAction();
  return (
    <Button
      variant="primary"
      size="sm"
      pending={b.pending}
      disabled={count === 0}
      status={{ state: b.state, label: "Done.", showError: true }}
      data-sunset-start
      onClick={async () => {
        if (automatic && !confirm(`Send the re-engagement email to ${count} people now?`)) return;
        const r = await b.run(() => startSunsetNow());
        if (r && "campaignId" in r && r.campaignId) router.push(`/marketing/email/campaigns/${r.campaignId}`);
      }}
    >
      {automatic ? "Send the re-engagement email now" : "Make the re-engagement campaign"}
    </Button>
  );
}

export function SuppressSilentButton({ runId, count }: { runId: string; count: number }) {
  const router = useRouter();
  const b = useButtonAction();
  return (
    <Button
      variant="danger"
      size="sm"
      pending={b.pending}
      status={{ state: b.state, label: "Done.", showError: true }}
      data-sunset-suppress
      onClick={async () => {
        if (!confirm(`Stop emailing the ${count} people who are still silent? They go on the do-not-email list; staff can take them off it.`)) return;
        const r = await b.run(() => suppressSunsetNow(runId));
        if (r && !("error" in r && r.error)) router.refresh();
      }}
    >
      Stop emailing the {count.toLocaleString("en-US")} still silent
    </Button>
  );
}

/** Settings › the sunset policy. */
export function SunsetSettingsForm({
  settings,
  templates,
  canEdit,
}: {
  settings: { mode: "confirm" | "automatic"; months: number; graceDays: number; templateId: string | null; subject: string };
  templates: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updateSunsetSettings, undefined);
  return (
    <form action={action} className="flex flex-col gap-3" data-sunset-settings>
      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
          Who takes the steps
          <Select name="sunset_mode" defaultValue={settings.mode}>
            <option value="confirm">A person confirms each step (recommended)</option>
            <option value="automatic">Automatic — the portal sends the re-engagement email and stops the silent ones by itself</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Silent for this many months
          <Input name="sunset_months" type="number" min={2} max={24} step={1} defaultValue={settings.months} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Days to answer the re-engagement email
          <Input name="sunset_grace_days" type="number" min={7} max={90} step={1} defaultValue={settings.graceDays} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Re-engagement email <span className="text-[10px]">(needed for automatic)</span>
          <Select name="sunset_template_id" defaultValue={settings.templateId ?? ""}>
            <option value="">Choose when making the campaign</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Its subject
          <Input name="sunset_subject" defaultValue={settings.subject} maxLength={200} required />
        </label>
      </fieldset>
      {canEdit && (
        <div>
          <Button type="submit" size="sm" variant="primary" pending={pending} status={{ state, label: "Saved." }}>
            Save sunset settings
          </Button>
        </div>
      )}
    </form>
  );
}
