import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { EmailTabs, karachiTime } from "../../EmailTabs";
import { BlockForm } from "./BlockForms";

/**
 * Content blocks (0361): a header, footer, signature or row of social icons
 * kept once and put into any template with {{block:key}}.
 */
export default async function ContentBlocksPage() {
  const { supabase } = await getStaffSession();
  const [canManage, { data }] = await Promise.all([
    hasPermission("email.templates.manage"),
    supabase.from("email_content_blocks").select("id, key, name, html, updated_at").order("name"),
  ]);
  const blocks = data ?? [];
  return (
    <div className="w-full">
      <Link prefetch={false} href="/marketing/email/templates" className="mb-2 inline-block text-xs text-primary hover:underline">
        ← Templates
      </Link>
      <h2 className="mb-1 text-lg font-semibold text-ink">Content blocks</h2>
      <p className="mb-4 text-sm text-muted">
        A header, footer, signature or row of social icons, kept once. Put one in any template by writing its tag, e.g.{" "}
        <code className="rounded bg-bg px-1 text-ink">{"{{block:footer}}"}</code> — change the block here and every email that uses it changes from
        then on. An email already sent keeps what it had.
      </p>
      <EmailTabs active="templates" />

      {canManage && (
        <Card className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">New block</h3>
          {/* Keyed by the count, so the form starts empty again once a block is added. */}
          <BlockForm key={blocks.length} block={null} canManage={canManage} />
        </Card>
      )}

      {!blocks.length ? (
        <p className="text-sm text-muted">No blocks yet.</p>
      ) : (
        <div className="flex flex-col gap-6" data-block-list>
          {blocks.map((b) => (
            <Card key={b.id as string}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium text-ink">{b.name as string}</h3>
                <span className="text-[11px] text-muted">Changed {karachiTime(b.updated_at as string)}</span>
              </div>
              <BlockForm block={{ id: b.id as string, key: b.key as string, name: b.name as string, html: b.html as string }} canManage={canManage} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
