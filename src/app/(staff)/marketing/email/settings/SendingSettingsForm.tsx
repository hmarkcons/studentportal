"use client";

import { useActionState } from "react";
import { updateEmailSendingSettings } from "@/lib/actions/emailSettings";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { keyedLines } from "@/lib/emailCampaigns/campaignRules";
import type { SendingSettings } from "@/lib/emailCampaigns/server";

export function SendingSettingsForm({ settings, canEdit, todaysCap }: { settings: SendingSettings; canEdit: boolean; todaysCap: number | null }) {
  const [state, action, pending] = useActionState(updateEmailSendingSettings, undefined);
  return (
    <form action={action} className="flex flex-col gap-4" data-sending-settings-form>
      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Emails a second <span className="text-[10px]">(the service&rsquo;s own limit — Amazon SES starts at 1, then 14 or more)</span>
          <Input name="send_per_second" type="number" min={0.1} max={100} step={0.1} defaultValue={settings.send_per_second} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Emails an hour <span className="text-[10px]">(across every campaign)</span>
          <Input name="send_per_hour" type="number" min={1} max={1000000} step={1} defaultValue={settings.send_per_hour} required />
        </label>

        <div className="flex flex-col gap-2 rounded-md border border-border p-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="warmup_enabled" defaultChecked={settings.warmup_enabled} data-warmup-enabled />
            Warm up a new sending domain
          </label>
          <p className="text-[11px] text-muted">
            Mail providers distrust a new sender that sends a lot at once. Warm-up starts with a small daily limit and grows it each day.
            {todaysCap !== null && <> Today&rsquo;s limit: <strong data-warmup-today>{todaysCap.toLocaleString("en-US")}</strong>.</>}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              First day&rsquo;s limit
              <Input name="warmup_start_cap" type="number" min={1} max={1000000} step={1} defaultValue={settings.warmup_start_cap} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Growth each day (%)
              <Input name="warmup_growth_pct" type="number" min={0} max={500} step={1} defaultValue={settings.warmup_growth_pct} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Started on <span className="text-[10px]">(today, if left empty)</span>
              <Input name="warmup_started_on" type="date" defaultValue={settings.warmup_started_on ?? ""} />
            </label>
          </div>
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Topics <span className="text-[10px]">(one a line, “key | Name” — what a recipient may choose on their preference page)</span>
          <Textarea name="topics" rows={6} defaultValue={keyedLines(settings.topics)} className="font-mono text-xs" data-settings-topics />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Conversion events <span className="text-[10px]">(one a line, “key | Name” — what the website script may report)</span>
          <Textarea name="conversion_events" rows={6} defaultValue={keyedLines(settings.conversion_events)} className="font-mono text-xs" data-settings-conversions />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2 sm:max-w-md">
          Keep each open&rsquo;s and click&rsquo;s browser and city for this many months{" "}
          <span className="text-[10px]">(then they are cleared; counts, device, mail app and country stay; 0 keeps them for ever)</span>
          <Input name="retention_months" type="number" min={0} max={120} step={1} defaultValue={settings.retention_months} required className="sm:w-28" data-retention-months />
        </label>
        <p className="text-[11px] text-muted sm:col-span-2">
          A key is stored on each address and sent by the website, so change a name freely but keep its key. A key taken away stops being offered; nobody&rsquo;s choices are lost.
        </p>
      </fieldset>
      {canEdit ? (
        <div>
          <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Saved." }}>
            Save sending settings
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">Only someone allowed to change the email settings can save them.</p>
      )}
    </form>
  );
}
