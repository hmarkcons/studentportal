import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAudience, audienceOptions } from "@/lib/emailCampaigns/audienceLoad";
import { validateRuleSet, type RuleSet } from "@/lib/emailCampaigns/audience";
import { EmailTabs } from "../../../EmailTabs";
import { AudienceNav } from "../../AudienceNav";
import { SegmentBuilder } from "./SegmentBuilder";

export default async function EmailSegmentPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const isNew = id === "new";
  const { supabase } = await getStaffSession();
  const admin = createAdminClient();
  const [canManage, segment, audience] = await Promise.all([
    hasPermission("email.audience.manage"),
    isNew ? Promise.resolve(null) : supabase.from("email_segments").select("id, name, description, rules").eq("id", id).maybeSingle().then((r) => r.data),
    loadAudience(admin),
  ]);
  if (!isNew && !segment) notFound();
  const options = await audienceOptions(admin, audience.contacts);
  const parsed = segment ? validateRuleSet(segment.rules) : null;
  const rules: RuleSet = parsed && !("error" in parsed) ? parsed : { match: "all", rules: [] };

  return (
    <div className="w-full">
      <Link prefetch={false} href="/marketing/email/audience/segments" className="mb-2 inline-block text-xs text-primary hover:underline">
        ← All segments
      </Link>
      <h2 className="mb-4 text-lg font-semibold text-ink">{segment?.name ?? "New segment"}</h2>
      <EmailTabs active="audience" />
      <AudienceNav active="segments" />
      <SegmentBuilder
        segmentId={segment?.id ?? null}
        initialName={segment?.name ?? ""}
        initialDescription={segment?.description ?? ""}
        initialRules={rules}
        options={options}
        canManage={canManage}
      />
    </div>
  );
}
