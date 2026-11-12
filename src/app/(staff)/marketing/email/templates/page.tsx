import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { overallStatus, type PreflightCheck } from "@/lib/emailCampaigns/preflight";
import { readEmailSettings } from "@/lib/emailCampaigns/server";
import { EmailTabs, karachiTime } from "../EmailTabs";
import { UploadTemplateForm } from "./UploadTemplateForm";

// An upload checks every link and image before it is saved, which can take a while.
export const maxDuration = 120;

const STATUS = {
  pass: { tone: "success", text: "Ready" },
  warn: { tone: "warning", text: "Has warnings" },
  fail: { tone: "danger", text: "Fix before sending" },
} as const;

type Row = {
  id: string;
  name: string;
  description: string | null;
  archived_at: string | null;
  updated_at: string;
  current: { id: string; version: number; size_bytes: number; preflight: PreflightCheck[] } | { id: string; version: number; size_bytes: number; preflight: PreflightCheck[] }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function EmailTemplatesPage(props: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await props.searchParams;
  const showArchived = archived === "1";
  const { supabase } = await getStaffSession();
  const [canManage, settings, { data }] = await Promise.all([
    hasPermission("email.templates.manage"),
    readEmailSettings(supabase),
    supabase
      .from("email_templates")
      .select("id, name, description, archived_at, updated_at, current:email_template_versions!email_templates_current_version_fkey(id, version, size_bytes, preflight)")
      .order("updated_at", { ascending: false })
      .returns<Row[]>(),
  ]);
  const rows = (data ?? []).filter((t) => Boolean(t.archived_at) === showArchived);

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">
        Upload a ready-made email, check it, preview it as any contact and send yourself a test. Campaigns and the audience
        come next; the sending service is connected once it is bought.
      </p>
      <EmailTabs active="templates" />

      {canManage && (
        <Card className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Upload a template</h3>
          <UploadTemplateForm maxMb={settings.max_upload_mb} />
        </Card>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">{showArchived ? "Archived templates" : "Templates"}</h3>
        <div className="flex gap-4">
          <Link prefetch={false} href="/marketing/email/templates/blocks" className="text-xs text-primary hover:underline" data-blocks-link>
            Content blocks
          </Link>
          <Link prefetch={false} href={showArchived ? "/marketing/email/templates" : "/marketing/email/templates?archived=1"} className="text-xs text-primary hover:underline">
            {showArchived ? "Back to templates" : "Show archived"}
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState>{showArchived ? "No archived templates." : "No templates yet. Upload the first one above."}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-email-template-list>
          {rows.map((t) => {
            const current = one(t.current);
            const status = STATUS[overallStatus(current?.preflight ?? [])];
            return (
              <Link prefetch={false}
                key={t.id}
                href={`/marketing/email/templates/${t.id}`}
                className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
                data-email-template-card
              >
                {/* A live, shrunken preview stands in for a thumbnail: nothing on Vercel can take a screenshot. */}
                <div className="relative h-44 overflow-hidden border-b border-border bg-white">
                  {current && (
                    <iframe
                      src={`/api/marketing/email-preview/${current.id}`}
                      title={`${t.name} thumbnail`}
                      loading="lazy"
                      tabIndex={-1}
                      sandbox=""
                      className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                      style={{ width: 680, height: 1100, transform: "scale(0.5)" }}
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-ink group-hover:text-primary">{t.name}</p>
                    <Badge tone={status.tone}>{status.text}</Badge>
                  </div>
                  {t.description && <p className="line-clamp-2 text-xs text-muted">{t.description}</p>}
                  <p className="text-[11px] text-muted">
                    Version {current?.version ?? "—"} · {current ? `${Math.round(current.size_bytes / 102.4) / 10} KB` : "—"} · updated {karachiTime(t.updated_at)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
