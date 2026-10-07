import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronRequest } from "@/lib/cronAuth";
import { deliverNotificationEmails } from "@/lib/notificationDelivery";
import { purgeTrash } from "@/lib/fileTrash";

// Every ten minutes (vercel.json): emails the alerts that are due one (0320),
// so something that happens at night goes out without anyone opening the
// portal — page views send them too, sooner, during the day. Then clears out
// old read alerts, so the table stays the size of what is worth keeping, and
// deleted files kept past their ninety days (src/lib/fileTrash.ts).
export async function GET(request: NextRequest) {
  const auth = checkCronRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await deliverNotificationEmails({ limit: 60 });

  const admin = createAdminClient();
  const ninetyDays = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const twoWeeks = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [, , purged] = await Promise.all([
    admin.from("notifications").delete().not("read_at", "is", null).lt("read_at", ninetyDays),
    // Only ever emailed, never shown: no need to keep them once read.
    admin.from("notifications").delete().eq("feed", false).not("read_at", "is", null).lt("read_at", twoWeeks),
    purgeTrash(),
  ]);

  return NextResponse.json({ ...result, purgedFiles: purged, ...(auth.warning ? { warning: auth.warning } : {}) });
}
