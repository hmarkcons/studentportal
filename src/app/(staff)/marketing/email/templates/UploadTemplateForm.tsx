"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadEmailTemplate } from "@/lib/actions/emailTemplates";
import { stageFile } from "@/lib/stageFile";
import { formatFileSize } from "@/lib/fileSize";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

/**
 * Uploads an email: a new template, or — given `templateId` — its next
 * version. The file goes from the browser straight into storage (the 40 MB
 * staging bucket) and the form posts only a reference to it, since a Vercel
 * Function refuses a request over 4.5 MB.
 */
export function UploadTemplateForm({ templateId, maxMb }: { templateId?: string; maxMb: number }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(uploadEmailTemplate, undefined);
  const [staged, setStaged] = useState<string | null>(null);
  const [staging, setStaging] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (state && "success" in state && state.templateId) {
      if (templateId) router.refresh();
      else router.push(`/marketing/email/templates/${state.templateId}`);
    }
  }, [state, templateId, router]);

  async function choose(file: File | undefined) {
    setStaged(null);
    setFileError(null);
    setFileNote(null);
    if (!file) return;
    if (!/\.(html?|zip)$/i.test(file.name)) {
      setFileError("Choose an .html file, or a .zip holding index.html with its images.");
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setFileError(`This file is ${formatFileSize(file.size)}; the limit is ${maxMb} MB.`);
      return;
    }
    setStaging(true);
    const result = await stageFile(file, { video: true });
    setStaging(false);
    if (!result.ok) {
      setFileError(result.error);
      return;
    }
    setStaged(result.ref);
    setFileNote(`${file.name} · ${formatFileSize(file.size)}`);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" data-email-template-upload>
      {templateId ? (
        <input type="hidden" name="template_id" value={templateId} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Template name
            <Input name="name" required maxLength={120} placeholder="e.g. Italy scholarships — November" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Description <span className="text-[10px]">(optional)</span>
            <Textarea name="description" rows={1} maxLength={500} placeholder="What it is for" />
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted">
        {templateId ? "New version — .html or .zip" : "Email file — .html, or .zip with index.html and its images"}
        <input
          type="file"
          accept=".html,.htm,.zip,text/html,application/zip"
          onChange={(e) => void choose(e.target.files?.[0])}
          className="text-xs text-ink file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-xs file:text-ink"
          data-email-template-file
        />
      </label>
      <input type="hidden" name="file" value={staged ?? ""} />
      {staging && <p className="text-xs text-muted">Uploading the file…</p>}
      {fileNote && !staging && <p className="text-xs text-muted">{fileNote} — ready.</p>}
      {fileError && <p className="text-xs text-danger">{fileError}</p>}
      <p className="text-[11px] text-muted">
        Scripts, forms, frames and video are taken out (email clients block them), images are put online, the CSS is
        written onto the email, and every link and image is checked. Checking the links can take up to a minute.
      </p>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" pending={pending} disabled={!staged || staging}>
          {templateId ? "Upload new version" : "Upload template"}
        </Button>
        {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
        {state && "success" in state && state.message && <p className="text-xs text-success">{state.message}</p>}
      </div>
    </form>
  );
}
