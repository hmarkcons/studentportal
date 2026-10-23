import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { ComposerForm } from "./ComposerForm";
import type { SocialPlatform } from "@/lib/social/types";

export default async function CreatePostPage() {
  const supabase = await createClient();
  const canPublish = await hasPermission("social.posts.publish");
  const [{ data: accounts }, { data: media }, { data: campaigns }, { data: destinations }] = await Promise.all([
    supabase.from("social_accounts").select("id, platform, display_name, username, status").neq("status", "disconnected").order("platform"),
    supabase.from("media_assets").select("id, public_url, kind, size_bytes").order("created_at", { ascending: false }),
    supabase.from("social_campaigns").select("id, name").order("name"),
    supabase.from("destinations").select("display_name").eq("status", "active").order("display_name"),
  ]);

  const accountList = (accounts ?? []).map((a) => ({
    id: a.id as string,
    platform: a.platform as SocialPlatform,
    displayName: a.display_name as string,
    username: (a.username as string | null) ?? null,
    status: a.status as string,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Create Post</h1>
        <p className="mt-1 text-sm text-muted">Compose once, target several platforms. Each platform&rsquo;s rules are checked as you go.</p>
      </div>

      {accountList.length === 0 ? (
        <Card>
          <p className="text-sm text-ink">No social accounts are connected yet.</p>
          <p className="mt-1 text-sm text-muted">
            Connect one on the{" "}
            <Link prefetch={false} href="/social/accounts" className="font-medium text-primary hover:underline">
              Accounts page
            </Link>{" "}
            first.
          </p>
        </Card>
      ) : (
        <ComposerForm
          accounts={accountList}
          media={(media ?? []).map((m) => ({ id: m.id as string, publicUrl: m.public_url as string, kind: m.kind as "image" | "video", sizeBytes: (m.size_bytes as number | null) ?? null }))}
          campaigns={(campaigns ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))}
          countries={(destinations ?? []).map((d) => d.display_name as string)}
          canPublish={canPublish}
        />
      )}
    </div>
  );
}
