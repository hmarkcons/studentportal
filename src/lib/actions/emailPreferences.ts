"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { readEmailTopics, unsubscribeByToken, addressByToken } from "@/lib/emailCampaigns/subscription";

// What a recipient does from the links in an email — no login: the private
// token in the link is the proof. Read and written through the service role,
// since the person is not a portal user.

type Result = { success: true; message: string } | { error: string };

/** Saves the topics chosen on the preference page; subscribes again someone who had unsubscribed. */
export async function savePreferences(token: string, _prev: unknown, formData: FormData): Promise<Result> {
  const admin = createAdminClient();
  const row = await addressByToken(admin, token);
  if (!row) return { error: "This link is not valid any more. Use the link in a more recent email." };
  if (row.status === "complained" || row.status === "bounced" || row.status === "invalid") {
    return { error: "Emails can't be sent to this address at the moment. Contact HMARK Consultants to change that." };
  }
  const known = (await readEmailTopics(admin)).map((t) => t.key);
  const chosen = formData.getAll("topic").map(String).filter((t) => known.includes(t));
  if (!chosen.length) return { error: "Choose at least one topic — or unsubscribe from all emails below." };
  // Every topic chosen is stored as "all", so a topic added later reaches them too.
  const topics = chosen.length === known.length ? [] : chosen;
  const wasOff = row.status !== "subscribed";
  const { error } = await admin
    .from("email_contact_status")
    .update({
      topics,
      ...(wasOff ? { status: "subscribed", status_reason: "Subscribed again on the preference page", status_changed_at: new Date().toISOString() } : {}),
    })
    .eq("token", token);
  if (error) return { error: "Your choices could not be saved. Try again." };
  revalidatePath(`/email/preferences/${token}`);
  return { success: true, message: wasOff ? "You are subscribed again, to the topics you chose." : "Your choices are saved." };
}

/** Unsubscribes the address from every email, from the preference or unsubscribe page. */
export async function unsubscribeFromAll(token: string, recipientToken?: string | null): Promise<Result> {
  const admin = createAdminClient();
  const done = await unsubscribeByToken(admin, token, "Unsubscribed on the unsubscribe page", recipientToken);
  if (!done) return { error: "This link is not valid any more. Use the link in a more recent email." };
  revalidatePath(`/email/preferences/${token}`);
  return { success: true, message: "You are unsubscribed and won't receive HMARK's emails." };
}
