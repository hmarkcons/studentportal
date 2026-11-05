"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { requirePermission } from "@/lib/auth/permissions";
import { uploadedFile } from "@/lib/stagedUpload";
import { sendEmail } from "@/lib/email";
import { readTemplateUpload } from "@/lib/emailCampaigns/templateFiles";
import { htmlToText, linksAndImages, processTemplateHtml } from "@/lib/emailCampaigns/templateHtml";
import { networkPreflight, staticPreflight, type PreflightCheck } from "@/lib/emailCampaigns/preflight";
import { renderMergeTags } from "@/lib/emailCampaigns/mergeTags";
import { EMAIL_ASSETS_BUCKET, assetStorageKey, previewValues, readEmailSettings } from "@/lib/emailCampaigns/server";
import { getCampaignProvider } from "@/lib/emailCampaigns/providers";

const TEMPLATES_PATH = "/marketing/email/templates";
const MANAGE_DENIED = "You don't have permission to manage email templates.";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Result = { success: true; message?: string; templateId?: string } | { error: string };

/**
 * Uploads an email — a new template, or, with `template_id`, the next version
 * of one — and makes it sendable (src/lib/emailCampaigns/templateHtml.ts):
 * the file is read and checked, the images it uses are put in the public
 * email-assets bucket, the HTML is processed, and the pre-flight checks run
 * once the images are in place to be loaded.
 *
 * The file arrives through the 40 MB staging bucket (the one made for the
 * consent video): a template zip may be up to 20 MB, over the 5 MB one.
 */
export async function uploadEmailTemplate(_prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("email.templates.manage", MANAGE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: "You have been signed out. Sign in again." };

  const existingId = String(formData.get("template_id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!existingId && !name) return { error: "Give the template a name." };
  if (name.length > 120) return { error: "Keep the name to 120 characters." };

  const file = await uploadedFile(formData, "file", { allowVideo: true });
  if (!file) return { error: "Choose the .html or .zip file to upload." };

  const settings = await readEmailSettings(supabase);
  const read = await readTemplateUpload(file.name, new Uint8Array(await file.arrayBuffer()), { maxBytes: settings.max_upload_mb * 1024 * 1024 });
  if ("error" in read) return { error: read.error };

  let templateId = existingId;
  let nextVersion = 1;
  if (existingId) {
    const { data: tpl } = await supabase.from("email_templates").select("id").eq("id", existingId).maybeSingle();
    if (!tpl) return { error: "That template no longer exists — reload the page." };
    const { data: last } = await supabase
      .from("email_template_versions")
      .select("version")
      .eq("template_id", existingId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    nextVersion = (last?.version ?? 0) + 1;
  } else {
    templateId = crypto.randomUUID();
  }
  const versionId = crypto.randomUUID();

  // Where each file will live, decided before processing so the HTML can point at it.
  const keys = new Map<string, string>();
  [...read.files.keys()].sort().forEach((path, i) => keys.set(path, assetStorageKey(templateId!, versionId, i + 1, path)));
  const publicUrl = (key: string) => supabase.storage.from(EMAIL_ASSETS_BUCKET).getPublicUrl(key).data.publicUrl;

  const processed = processTemplateHtml({
    html: read.html,
    htmlPath: read.htmlPath,
    files: read.files,
    assetUrl: (path) => publicUrl(keys.get(path)!),
    footerAddress: settings.physical_address,
  });

  // The files the email uses (a stylesheet is inlined, not uploaded).
  const uploads = processed.usedAssets
    .map((path) => ({ path, key: keys.get(path)!, file: read.files.get(path)! }))
    .filter((u) => u.file.mime !== "text/css");
  const uploaded: string[] = [];
  const cleanUp = async () => {
    if (uploaded.length) await supabase.storage.from(EMAIL_ASSETS_BUCKET).remove(uploaded);
  };
  for (const u of uploads) {
    const { error } = await supabase.storage
      .from(EMAIL_ASSETS_BUCKET)
      .upload(u.key, u.file.bytes, { contentType: u.file.mime, upsert: false, cacheControl: "31536000" });
    if (error) {
      await cleanUp();
      return { error: `${u.path} could not be uploaded: ${error.message}` };
    }
    uploaded.push(u.key);
  }

  // With the images in place, every link and image is asked whether it loads.
  const preflight: PreflightCheck[] = [...staticPreflight(processed), ...(await networkPreflight(processed, { timeoutMs: 6000 }))];

  if (!existingId) {
    const { error } = await supabase.from("email_templates").insert({
      id: templateId,
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      created_by: user.id,
    });
    if (error) {
      await cleanUp();
      return { error: error.message };
    }
  }
  const { error: versionError } = await supabase.from("email_template_versions").insert({
    id: versionId,
    template_id: templateId,
    version: nextVersion,
    source_kind: read.kind,
    source_name: file.name,
    html: processed.html,
    text_body: processed.text,
    removed: processed.removed,
    preflight,
    ignored: read.ignored,
    size_bytes: processed.sizeBytes,
    merge_tags: processed.mergeTags,
    footer_added: processed.footerAdded,
    asset_count: uploads.length,
    created_by: user.id,
  });
  if (versionError) {
    await cleanUp();
    if (!existingId) await supabase.from("email_templates").delete().eq("id", templateId);
    return { error: versionError.message };
  }
  if (uploads.length) {
    await supabase.from("email_assets").insert(
      uploads.map((u) => ({
        version_id: versionId,
        source_path: u.path,
        storage_path: u.key,
        public_url: publicUrl(u.key),
        mime: u.file.mime,
        bytes: u.file.bytes.byteLength,
      }))
    );
  }
  const { error: currentError } = await supabase.from("email_templates").update({ current_version_id: versionId }).eq("id", templateId);
  if (currentError) return { error: currentError.message };

  revalidatePath(TEMPLATES_PATH);
  revalidatePath(`${TEMPLATES_PATH}/${templateId}`);
  return {
    success: true,
    templateId: templateId!,
    message: existingId ? `Uploaded as version ${nextVersion}.` : "Template uploaded.",
  };
}

/** Asks every link and image of a version again — after a page has been fixed, say. */
export async function recheckTemplateVersion(versionId: string): Promise<Result> {
  const denied = await requirePermission("email.templates.manage", MANAGE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: v } = await supabase.from("email_template_versions").select("template_id, html, preflight").eq("id", versionId).maybeSingle();
  if (!v) return { error: "That version no longer exists." };
  const fresh = await networkPreflight(linksAndImages(v.html as string), { timeoutMs: 6000 });
  const kept = ((v.preflight as PreflightCheck[]) ?? []).filter((c) => c.key !== "links" && c.key !== "images_load");
  const { error } = await supabase.from("email_template_versions").update({ preflight: [...kept, ...fresh] }).eq("id", versionId);
  if (error) return { error: error.message };
  revalidatePath(`${TEMPLATES_PATH}/${v.template_id}`);
  return { success: true, message: "Links and images checked again." };
}

/** Saves the plain-text version as edited; blank, it is made again from the HTML. */
export async function saveTemplateText(versionId: string, _prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("email.templates.manage", MANAGE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: v } = await supabase.from("email_template_versions").select("template_id, html").eq("id", versionId).maybeSingle();
  if (!v) return { error: "That version no longer exists." };
  let text = String(formData.get("text_body") ?? "").replace(/\r\n/g, "\n").trim();
  const regenerated = text === "";
  if (regenerated) text = htmlToText(v.html as string);
  if (text.length > 200_000) return { error: "The plain-text version is too long." };
  const { data: saved, error } = await supabase.from("email_template_versions").update({ text_body: text }).eq("id", versionId).select("id");
  if (error) return { error: error.message };
  if (!saved?.length) return { error: MANAGE_DENIED };
  revalidatePath(`${TEMPLATES_PATH}/${v.template_id}`);
  return { success: true, message: regenerated ? "Made again from the email." : "Saved." };
}

export async function updateEmailTemplateDetails(templateId: string, _prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("email.templates.manage", MANAGE_DENIED);
  if (denied) return denied;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the template a name." };
  if (name.length > 120) return { error: "Keep the name to 120 characters." };
  const description = String(formData.get("description") ?? "").trim() || null;
  if (description && description.length > 500) return { error: "Keep the description to 500 characters." };
  const supabase = await createClient();
  const { data: saved, error } = await supabase.from("email_templates").update({ name, description }).eq("id", templateId).select("id");
  if (error) return { error: error.message };
  if (!saved?.length) return { error: "That template no longer exists." };
  revalidatePath(TEMPLATES_PATH);
  revalidatePath(`${TEMPLATES_PATH}/${templateId}`);
  return { success: true };
}

/** Archives a template, or brings it back. Its images stay: an email already sent may still show them. */
export async function setEmailTemplateArchived(templateId: string, archived: boolean): Promise<Result> {
  const denied = await requirePermission("email.templates.manage", MANAGE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: saved, error } = await supabase
    .from("email_templates")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", templateId)
    .select("id");
  if (error) return { error: error.message };
  if (!saved?.length) return { error: "That template no longer exists." };
  revalidatePath(TEMPLATES_PATH);
  revalidatePath(`${TEMPLATES_PATH}/${templateId}`);
  return { success: true, message: archived ? "Archived." : "Restored." };
}

/** Makes an earlier version the one in use again. */
export async function makeTemplateVersionCurrent(templateId: string, versionId: string): Promise<Result> {
  const denied = await requirePermission("email.templates.manage", MANAGE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: v } = await supabase.from("email_template_versions").select("id, version").eq("id", versionId).eq("template_id", templateId).maybeSingle();
  if (!v) return { error: "That version no longer exists." };
  const { error } = await supabase.from("email_templates").update({ current_version_id: versionId }).eq("id", templateId);
  if (error) return { error: error.message };
  revalidatePath(TEMPLATES_PATH);
  revalidatePath(`${TEMPLATES_PATH}/${templateId}`);
  return { success: true, message: `Version ${v.version} is now the one in use.` };
}

/** A new template from a copy of one's current version, its images shared (they are never removed). */
export async function duplicateEmailTemplate(templateId: string): Promise<Result> {
  const denied = await requirePermission("email.templates.manage", MANAGE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: tpl } = await supabase.from("email_templates").select("name, description, current_version_id").eq("id", templateId).maybeSingle();
  if (!tpl?.current_version_id) return { error: "That template has no version to copy." };
  const { data: v } = await supabase
    .from("email_template_versions")
    .select("html, text_body, removed, preflight, ignored, size_bytes, merge_tags, footer_added, asset_count")
    .eq("id", tpl.current_version_id)
    .maybeSingle();
  if (!v) return { error: "That template's version could not be read." };
  const { data: assets } = await supabase.from("email_assets").select("source_path, storage_path, public_url, mime, bytes").eq("version_id", tpl.current_version_id);

  const newId = crypto.randomUUID();
  const newVersionId = crypto.randomUUID();
  const copyName = `Copy of ${tpl.name}`.slice(0, 120);
  const { error: tplError } = await supabase.from("email_templates").insert({ id: newId, name: copyName, description: tpl.description, created_by: user?.id ?? null });
  if (tplError) return { error: tplError.message };
  const { error: vError } = await supabase.from("email_template_versions").insert({
    id: newVersionId,
    template_id: newId,
    version: 1,
    source_kind: "copy",
    source_name: tpl.name,
    ...v,
    created_by: user?.id ?? null,
  });
  if (vError) {
    await supabase.from("email_templates").delete().eq("id", newId);
    return { error: vError.message };
  }
  if (assets?.length) await supabase.from("email_assets").insert(assets.map((a) => ({ ...a, version_id: newVersionId })));
  await supabase.from("email_templates").update({ current_version_id: newVersionId }).eq("id", newId);
  revalidatePath(TEMPLATES_PATH);
  return { success: true, templateId: newId, message: `Copied as “${copyName}”.` };
}

/** Leads to preview an email as, found by name or email — only those the signed-in person may see. */
export async function searchEmailPreviewContacts(query: string): Promise<{ id: string; full_name: string | null; email: string | null }[]> {
  if (await requirePermission("page.marketing.email", "denied")) return [];
  const q = query.trim().replace(/[%,()]/g, " ").slice(0, 60);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, full_name, email")
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .not("email", "is", null)
    .order("full_name")
    .limit(8);
  return data ?? [];
}

/**
 * Sends a version to up to five addresses as a test, filled in as the chosen
 * contact (or the sample one). Tests are never counted in a campaign's report.
 * Until a sending service is connected, they go out through the portal's own
 * mailbox, which is fine for a handful of tests and never used for a campaign.
 */
export async function sendTemplateTest(versionId: string, _prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("email.templates.manage", MANAGE_DENIED);
  if (denied) return denied;
  const addresses = [...new Set(String(formData.get("to") ?? "").split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter(Boolean))];
  if (!addresses.length) return { error: "Give at least one address to send the test to." };
  if (addresses.length > 5) return { error: "A test goes to five addresses at most." };
  const bad = addresses.filter((a) => !EMAIL_RE.test(a));
  if (bad.length) return { error: `Not an email address: ${bad.join(", ")}.` };

  const supabase = await createClient();
  // Named: versions and templates point at each other (template_id, current_version_id).
  const { data: v, error } = await supabase
    .from("email_template_versions")
    .select("html, text_body, template:email_templates!email_template_versions_template_id_fkey(name)")
    .eq("id", versionId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!v) return { error: "That version no longer exists." };
  const templateName = (Array.isArray(v.template) ? v.template[0] : v.template)?.name ?? "Email";
  const subject = (String(formData.get("subject") ?? "").trim() || templateName).slice(0, 200);
  const { values } = await previewValues(supabase, String(formData.get("contact_id") ?? "") || null);
  const html = renderMergeTags(v.html as string, values, { html: true });
  const text = renderMergeTags((v.text_body as string) || htmlToText(v.html as string), values, { html: false });
  const settings = await readEmailSettings(supabase);

  const provider = getCampaignProvider(settings.provider);
  const failures: string[] = [];
  for (const to of addresses) {
    if (provider) {
      try {
        await provider.sendOne({
          to,
          from: settings.from_email ? `${settings.from_name} <${settings.from_email}>` : settings.from_name,
          replyTo: settings.reply_to,
          subject: `[Test] ${subject}`,
          html,
          text,
          headers: { "X-HMARK-Test": "1" },
        });
      } catch (e) {
        failures.push(`${to}: ${e instanceof Error ? e.message : "not sent"}`);
      }
    } else {
      const sent = await sendEmail({ to, subject: `[Test] ${subject}`, html, text, replyTo: settings.reply_to ?? undefined });
      if ("error" in sent && sent.error) failures.push(`${to}: ${sent.error}`);
    }
  }
  if (failures.length === addresses.length) return { error: `The test was not sent. ${failures.join("; ")}` };
  const via = provider ? provider.label : "the portal's own mailbox (no sending service is connected yet)";
  const sentCount = addresses.length - failures.length;
  return {
    success: true,
    message: `Test sent to ${sentCount} address${sentCount === 1 ? "" : "es"} through ${via}.${failures.length ? ` Not sent: ${failures.join("; ")}` : ""}`,
  };
}
