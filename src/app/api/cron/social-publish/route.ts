import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronRequest } from "@/lib/cronAuth";
import { runDuePosts, syncMetrics } from "@/lib/social/publisher";

// Every minute (vercel.json): claims scheduled social posts whose time has come
// and publishes each platform target, idempotently, retrying transient errors
// with backoff. In sandbox the mock provider "publishes" instantly. Also refreshes
// a few published posts' cached engagement metrics (only the stale ones).
export async function GET(request: NextRequest) {
  const auth = checkCronRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = createAdminClient();
  const result = await runDuePosts(admin);
  const metrics = await syncMetrics(admin);
  return NextResponse.json({ ok: true, ...result, ...metrics });
}
