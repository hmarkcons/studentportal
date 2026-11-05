"use client";

import { useActionState } from "react";
import { updateEmailSettings } from "@/lib/actions/emailSettings";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import type { EmailSettings } from "@/lib/emailCampaigns/server";

export function EmailSettingsForm({
  settings,
  canEdit,
  connectable,
}: {
  settings: EmailSettings;
  canEdit: boolean;
  /** Which services have every key set, and so may be chosen. */
  connectable: { ses: boolean; resend: boolean };
}) {
  const [state, action, pending] = useActionState(updateEmailSettings, undefined);
  return (
    <form action={action} className="flex flex-col gap-4" data-email-settings-form>
      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
          Sending service
          <Select name="provider" defaultValue={settings.provider}>
            <option value="none">Not connected — nothing is sent in bulk</option>
            <option value="ses" disabled={!connectable.ses}>
              Amazon SES{connectable.ses ? "" : " — keys not set yet"}
            </option>
            <option value="resend" disabled={!connectable.resend}>
              Resend{connectable.resend ? "" : " — keys not set yet"}
            </option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Sender name
          <Input name="from_name" defaultValue={settings.from_name} required maxLength={80} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Sender address <span className="text-[10px]">(on the sending subdomain, e.g. news@news.hmarkconsultants.com)</span>
          <Input name="from_email" type="email" defaultValue={settings.from_email ?? ""} placeholder="news@news.hmarkconsultants.com" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Reply-to address <span className="text-[10px]">(where replies go)</span>
          <Input name="reply_to" type="email" defaultValue={settings.reply_to ?? ""} placeholder="info@hmarkconsultants.com" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Largest template upload (MB)
          <Input name="max_upload_mb" type="number" min={1} max={40} step={1} defaultValue={settings.max_upload_mb} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
          HMARK&rsquo;s address <span className="text-[10px]">(printed in the footer every campaign email carries)</span>
          <Textarea name="physical_address" defaultValue={settings.physical_address} rows={2} required maxLength={300} />
        </label>
      </fieldset>
      {canEdit ? (
        <div>
          <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Saved." }}>
            Save settings
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">Only someone allowed to change the email settings can save them.</p>
      )}
    </form>
  );
}
