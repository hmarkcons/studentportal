import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MERGE_TAGS } from "@/lib/emailCampaigns/mergeTags";
import { overallStatus, type PreflightCheck } from "@/lib/emailCampaigns/preflight";
import { readEmailSettings } from "@/lib/emailCampaigns/server";
import { EmailTabs, karachiTime } from "../../EmailTabs";
import { UploadTemplateForm } from "../UploadTemplateForm";
import { TemplateWorkbench } from "./TemplateWorkbench";
import { RecheckButton, TemplateButtons, TemplateDetailsForm, TemplateTextForm, UseVersionButton } from "./TemplateControls";

// Re-checking links, or uploading a new version, waits on every link answering.
export const maxDuration = 120;

type Version = {
  id: string;
  version: number;
  source_kind: string;
  source_name: string | null;
  html: string;
  text_body: string;
  removed: { what: string; count: number; why: string }[];
  preflight: PreflightCheck[];
  ignored: { path: string; reason: string }[];
  size_bytes: number;
  merge_tags: string[];
  footer_added: boolean;
  asset_count: number;
  created_at: string;
  author: { full_name: string } | { full_name: string }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const ICON = { pass: "✓", warn: "!", fail: "✕" } as const;
const ICON_CLASS = { pass: "bg-success-bg text-success", warn: "bg-warning-bg text-warning", fail: "bg-danger-bg text-danger" } as const;
const OVERALL = {
  pass: { tone: "success", text: "Ready to send" },
  warn: { tone: "warning", text: "Has warnings" },
  fail: { tone: "danger", text: "Fix before sending" },
} as const;

export default async function EmailTemplatePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await props.params;
  const { v: chosen } = await props.searchParams;
  const { supabase } = await getStaffSession();

  const [canManage, settings, { data: template }, { data: versions }] = await Promise.all([
    hasPermission("email.templates.manage"),
    readEmailSettings(supabase),
    supabase.from("email_templates").select("id, name, description, current_version_id, archived_at, created_at").eq("id", id).maybeSingle(),
    supabase
      .from("email_template_versions")
      .select(
        "id, version, source_kind, source_name, html, text_body, removed, preflight, ignored, size_bytes, merge_tags, footer_added, asset_count, created_at, author:staff!email_template_versions_created_by_fkey(full_name)"
      )
      .eq("template_id", id)
      .order("version", { ascending: false })
      .returns<Version[]>(),
  ]);
  if (!template) notFound();

  const list = versions ?? [];
  const shown = list.find((v) => v.id === chosen) ?? list.find((v) => v.id === template.current_version_id) ?? list[0];
  const isCurrent = shown?.id === template.current_version_id;
  const status = shown ? OVERALL[overallStatus(shown.preflight)] : null;

  return (
    <div className="w-full">
      <Link prefetch={false} href="/marketing/email/templates" className="mb-2 inline-block text-xs text-primary hover:underline">
        ← All templates
      </Link>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">{template.name}</h2>
        {status && <Badge tone={status.tone}>{status.text}</Badge>}
        {template.archived_at && <Badge tone="neutral">Archived</Badge>}
      </div>
      {template.description && <p className="mb-3 text-sm text-muted">{template.description}</p>}
      <EmailTabs active="templates" />

      {canManage && (
        <Card className="mb-6">
          <div className="flex flex-col gap-4">
            <TemplateDetailsForm templateId={template.id} name={template.name} description={template.description} />
            <TemplateButtons templateId={template.id} archived={Boolean(template.archived_at)} />
          </div>
        </Card>
      )}

      {!shown ? (
        <Card>
          <p className="text-sm text-muted">This template has no version yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-ink">
                  Version {shown.version} {isCurrent ? <span className="text-xs font-normal text-muted">· in use</span> : <span className="text-xs font-normal text-warning">· not the version in use</span>}
                </h3>
                {canManage && !isCurrent && <UseVersionButton templateId={template.id} versionId={shown.id} />}
              </div>
              <TemplateWorkbench versionId={shown.id} templateName={template.name} canSendTest={canManage} />
            </Card>

            <Card>
              <h3 className="mb-1 text-sm font-medium text-ink">Plain-text version</h3>
              <p className="mb-3 text-xs text-muted">
                Sent alongside the email for clients that show text only, and read by spam filters. Made from the email; edit it if
                it reads badly.
              </p>
              <TemplateTextForm key={shown.id} versionId={shown.id} text={shown.text_body} canEdit={canManage} />
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-ink">Pre-flight checks</h3>
                {canManage && <RecheckButton versionId={shown.id} />}
              </div>
              <ul className="flex flex-col gap-3" data-email-preflight>
                {shown.preflight.map((c) => (
                  <li key={c.key} className="flex gap-2" data-check={c.key} data-status={c.status}>
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${ICON_CLASS[c.status]}`} aria-label={c.status}>
                      {ICON[c.status]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{c.label}</p>
                      <p className="text-xs text-muted">{c.detail}</p>
                      {c.items && c.items.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-[11px] text-muted">
                          {c.items.slice(0, 12).map((item) => (
                            <li key={item} className="break-all">
                              {item}
                            </li>
                          ))}
                          {c.items.length > 12 && <li>and {c.items.length - 12} more</li>}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {shown.ignored.length > 0 && (
                <details className="mt-4 text-xs text-muted">
                  <summary className="cursor-pointer text-ink">Files in the zip that were not used ({shown.ignored.length})</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {shown.ignored.map((f) => (
                      <li key={f.path} className="break-all">
                        {f.path} — {f.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>

            {canManage && (
              <Card>
                <h3 className="mb-3 text-sm font-medium text-ink">Upload a new version</h3>
                <UploadTemplateForm templateId={template.id} maxMb={settings.max_upload_mb} />
              </Card>
            )}

            <Card>
              <h3 className="mb-3 text-sm font-medium text-ink">Versions</h3>
              <ul className="flex flex-col divide-y divide-border">
                {list.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <div className="min-w-0">
                      <Link prefetch={false} href={`/marketing/email/templates/${template.id}?v=${v.id}`} className={`font-medium ${v.id === shown.id ? "text-primary" : "text-ink hover:text-primary"}`}>
                        Version {v.version}
                      </Link>
                      {v.id === template.current_version_id && <span className="ml-1 text-success">· in use</span>}
                      <p className="truncate text-muted">
                        {karachiTime(v.created_at)} · {one(v.author)?.full_name ?? "—"} · {v.source_kind === "copy" ? `copied from ${v.source_name}` : v.source_name}
                      </p>
                    </div>
                    <Badge tone={OVERALL[overallStatus(v.preflight)].tone}>{OVERALL[overallStatus(v.preflight)].text}</Badge>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-ink">Personalisation tags</summary>
                <p className="mt-2 text-xs text-muted">
                  Write these in the email and each recipient gets their own. Give a fallback for a blank value after a bar:
                  <code className="mx-1 rounded bg-bg px-1">{"{{first_name|there}}"}</code>.
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-xs">
                  {MERGE_TAGS.map((t) => (
                    <li key={t.tag}>
                      <code className="rounded bg-bg px-1 text-ink">{`{{${t.tag}}}`}</code> <span className="text-muted">{t.label}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
