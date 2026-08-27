import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewTemplateForm } from "./NewTemplateForm";
import { DeleteTemplateButton } from "./DeleteTemplateButton";

export default async function MessageTemplatesPage() {
  const supabase = await createClient();
  const { data: templates } = await supabase.from("message_templates").select("*").order("purpose");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Message Templates</h2>
      <Card className="mb-6">
        <NewTemplateForm />
      </Card>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(templates ?? []).map((t) => (
          <div key={t.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="text-ink">
                {t.purpose} <Badge tone="info">{t.channel}</Badge>
              </p>
              {t.subject && <p className="mt-1 text-xs text-muted">Subject: {t.subject}</p>}
              <p className="mt-1 text-xs text-muted">{t.body}</p>
            </div>
            <DeleteTemplateButton id={t.id} />
          </div>
        ))}
        {(!templates || templates.length === 0) && (
          <div className="px-4 py-6">
            <EmptyState>No templates yet.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
