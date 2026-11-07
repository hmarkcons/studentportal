import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { EmailTabs } from "../../EmailTabs";
import { AudienceNav } from "../AudienceNav";
import { ImportWizard } from "./ImportWizard";

// Importing checks each new address's domain for a mail server, which takes a while for a big sheet.
export const maxDuration = 300;

export default async function EmailImportPage() {
  const { supabase } = await getStaffSession();
  const [canManage, { data: lists }] = await Promise.all([hasPermission("email.audience.manage"), supabase.from("email_lists").select("id, name").order("name")]);
  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">
        Import people from a spreadsheet into a list. An address that is already a lead joins as that lead; anyone else
        becomes an imported contact — kept apart from leads, so they never appear in counsellors&rsquo; lists. Bad addresses,
        repeated rows, and domains that take no email are listed and left out.
      </p>
      <EmailTabs active="audience" />
      <AudienceNav active="import" />
      <Card>{canManage ? <ImportWizard lists={(lists ?? []) as { id: string; name: string }[]} /> : <p className="text-sm text-muted">Importing needs permission to manage the email audience.</p>}</Card>
    </div>
  );
}
