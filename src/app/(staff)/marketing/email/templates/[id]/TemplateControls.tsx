"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  duplicateEmailTemplate,
  recheckTemplateVersion,
  saveTemplateText,
  setEmailTemplateArchived,
  updateEmailTemplateDetails,
  makeTemplateVersionCurrent,
} from "@/lib/actions/emailTemplates";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

/** The template's name and description. */
export function TemplateDetailsForm({ templateId, name, description }: { templateId: string; name: string; description: string | null }) {
  const [state, action, pending] = useActionState(updateEmailTemplateDetails.bind(null, templateId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <Input name="name" defaultValue={name} required maxLength={120} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Description
          <Input name="description" defaultValue={description ?? ""} maxLength={500} />
        </label>
      </div>
      <div>
        <Button type="submit" size="sm" pending={pending} status={{ state, label: "Saved." }}>
          Save details
        </Button>
      </div>
    </form>
  );
}

/** Duplicate, and archive or restore. */
export function TemplateButtons({ templateId, archived }: { templateId: string; archived: boolean }) {
  const router = useRouter();
  const copy = useButtonAction();
  const archive = useButtonAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        pending={copy.pending}
        status={{ state: copy.state, label: "Copied.", showError: true }}
        onClick={async () => {
          const result = await copy.run(() => duplicateEmailTemplate(templateId));
          if (result && "templateId" in result && result.templateId) router.push(`/marketing/email/templates/${result.templateId}`);
        }}
      >
        Duplicate
      </Button>
      <Button
        size="sm"
        variant={archived ? "outline" : "ghost"}
        pending={archive.pending}
        status={{ state: archive.state, label: archived ? "Restored." : "Archived.", showError: true }}
        onClick={async () => {
          if (!archived && !confirm("Archive this template? It is hidden from the list, and can be restored.")) return;
          await archive.run(() => setEmailTemplateArchived(templateId, !archived));
          router.refresh();
        }}
      >
        {archived ? "Restore" : "Archive"}
      </Button>
    </div>
  );
}

/** Asks every link and image again. */
export function RecheckButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const run = useButtonAction();
  return (
    <Button
      size="sm"
      pending={run.pending}
      status={{ state: run.state, label: "Checked again.", showError: true }}
      onClick={async () => {
        await run.run(() => recheckTemplateVersion(versionId));
        router.refresh();
      }}
    >
      Check links again
    </Button>
  );
}

/** Makes an earlier version the one in use. */
export function UseVersionButton({ templateId, versionId }: { templateId: string; versionId: string }) {
  const router = useRouter();
  const run = useButtonAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      pending={run.pending}
      status={{ state: run.state, label: "In use.", showError: true }}
      onClick={async () => {
        await run.run(() => makeTemplateVersionCurrent(templateId, versionId));
        router.refresh();
      }}
    >
      Use this version
    </Button>
  );
}

/** The plain-text version, editable; emptied and saved, it is made again from the email. */
export function TemplateTextForm({ versionId, text, canEdit }: { versionId: string; text: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveTemplateText.bind(null, versionId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Textarea name="text_body" defaultValue={text} rows={14} readOnly={!canEdit} className="font-mono text-xs" data-email-text-version />
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" pending={pending} status={{ state, label: state && "success" in state ? (state.message ?? "Saved.") : "Saved." }}>
            Save plain text
          </Button>
          <span className="text-[11px] text-muted">Empty the box and save to make it again from the email.</span>
        </div>
      )}
    </form>
  );
}
