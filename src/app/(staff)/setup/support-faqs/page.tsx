import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { FaqEditor, type FaqRow } from "./FaqEditor";

export default async function SupportFaqsSetupPage() {
  const supabase = await createClient();

  // Unpublished entries are included here and filtered on the portal side, so
  // staff can see and finish their own drafts.
  const { data: faqs } = await supabase
    .from("support_faqs")
    .select("id, question, answer, sort_order, is_published")
    .order("sort_order", { ascending: true })
    .returns<FaqRow[]>();

  return (
    <div className="w-full max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Support FAQ</h2>
      <p className="mb-4 text-sm text-muted">
        Shown to every registered student on their Support page, in this order. Answers used to be hardcoded, so a
        correction needed a deploy.
      </p>
      <Card>
        <FaqEditor faqs={faqs ?? []} />
      </Card>
    </div>
  );
}
