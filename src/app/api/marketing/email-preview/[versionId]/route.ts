import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { renderMergeTags } from "@/lib/emailCampaigns/mergeTags";
import { previewDocument } from "@/lib/emailCampaigns/preview";
import { previewValues } from "@/lib/emailCampaigns/server";

// A template version as the preview frame shows it: filled in as a contact
// (?contact=<lead id>, else the sample one), optionally in imitation dark mode
// (?dark=1), cleaned of anything that could run, and served under a sandbox
// policy — an opaque origin with no script — so even a template that slipped
// past the upload pipeline can do nothing inside the portal.
//
// Read as the signed-in person, so only someone who may open Email campaigns
// sees a template, and only a lead they may see can fill one in.
export async function GET(request: NextRequest, ctx: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to preview this email.", { status: 401 });
  const supabase = await createClient();
  const { data: version } = await supabase.from("email_template_versions").select("html").eq("id", versionId).maybeSingle();
  if (!version) return new Response("That email could not be found.", { status: 404 });

  const params = request.nextUrl.searchParams;
  const { values } = await previewValues(supabase, params.get("contact"));
  const html = previewDocument(renderMergeTags(version.html as string, values, { html: true }), { dark: params.get("dark") === "1" });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline' *; font-src * data:",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
    },
  });
}
