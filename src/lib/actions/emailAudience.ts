"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { requirePermission } from "@/lib/auth/permissions";
import { uploadedFile } from "@/lib/stagedUpload";
import { parseCsv, readCsvFile } from "@/lib/csv";
import { loadAudience } from "@/lib/emailCampaigns/audienceLoad";
import {
  CONTACT_STATUS_LABELS,
  normalizeEmail,
  resolveAudience,
  validateRuleSet,
  type AudienceCounts,
  type ContactStatus,
} from "@/lib/emailCampaigns/audience";
import { guessEmailColumn, guessMapping, IMPORT_FIELDS, readImportRows, type ImportField, type ImportMapping } from "@/lib/emailCampaigns/contactImport";
import { checkDomains } from "@/lib/emailCampaigns/mx";

const AUDIENCE = "/marketing/email/audience";
const VIEW_DENIED = "You don't have access to email campaigns.";
const MANAGE_DENIED = "You don't have permission to manage the email audience.";

type Fail = { error: string };

// ------------------------------------------------------------------ segments

export type AudiencePreview = {
  counts: AudienceCounts;
  sample: { name: string; email: string; kind: "lead" | "contact" }[];
};

/** How many a segment reaches now, how many fall out and why, and the first few. */
export async function previewSegmentAudience(rulesJson: string): Promise<AudiencePreview | Fail> {
  const denied = await requirePermission("page.marketing.email", VIEW_DENIED);
  if (denied) return denied;
  const rules = validateRuleSet(rulesJson);
  if ("error" in rules) return rules;
  const { contacts, statuses } = await loadAudience(createAdminClient());
  const { recipients, counts } = resolveAudience({ contacts, include: { segments: [rules], lists: [] }, statuses });
  return {
    counts,
    sample: recipients.slice(0, 20).map((c) => ({ name: c.fullName || "—", email: c.email ?? "", kind: c.kind })),
  };
}

export async function saveEmailSegment(segmentId: string | null, _prev: unknown, formData: FormData): Promise<({ success: true; segmentId: string }) | Fail> {
  const denied = await requirePermission("email.audience.manage", MANAGE_DENIED);
  if (denied) return denied;
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Give the segment a name (at most 120 characters)." };
  const description = String(formData.get("description") ?? "").trim() || null;
  if (description && description.length > 500) return { error: "Keep the description to 500 characters." };
  const rules = validateRuleSet(String(formData.get("rules") ?? ""));
  if ("error" in rules) return rules;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (segmentId) {
    const { data, error } = await supabase.from("email_segments").update({ name, description, rules }).eq("id", segmentId).select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "That segment no longer exists." };
    revalidatePath(`${AUDIENCE}/segments`);
    // Its own page too: React resets the form after the action, back to the props it has.
    revalidatePath(`${AUDIENCE}/segments/${segmentId}`);
    return { success: true, segmentId };
  }
  const { data, error } = await supabase.from("email_segments").insert({ name, description, rules, created_by: user?.id ?? null }).select("id").single();
  if (error) return { error: error.message };
  revalidatePath(`${AUDIENCE}/segments`);
  return { success: true, segmentId: data.id as string };
}

export async function deleteEmailSegment(segmentId: string): Promise<{ success: true } | Fail> {
  const denied = await requirePermission("email.audience.manage", MANAGE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_segments").delete().eq("id", segmentId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That segment no longer exists." };
  revalidatePath(`${AUDIENCE}/segments`);
  return { success: true };
}

// ------------------------------------------------------------------ lists

export async function saveEmailList(listId: string | null, _prev: unknown, formData: FormData): Promise<({ success: true; listId: string }) | Fail> {
  const denied = await requirePermission("email.audience.manage", MANAGE_DENIED);
  if (denied) return denied;
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Give the list a name (at most 120 characters)." };
  const description = String(formData.get("description") ?? "").trim() || null;
  if (description && description.length > 500) return { error: "Keep the description to 500 characters." };
  const supabase = await createClient();
  if (listId) {
    const { data, error } = await supabase.from("email_lists").update({ name, description }).eq("id", listId).select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "That list no longer exists." };
    revalidatePath(`${AUDIENCE}/lists`);
    revalidatePath(`${AUDIENCE}/lists/${listId}`);
    return { success: true, listId };
  }
  const user = await getCurrentUser();
  const { data, error } = await supabase.from("email_lists").insert({ name, description, created_by: user?.id ?? null }).select("id").single();
  if (error) return { error: error.message };
  revalidatePath(`${AUDIENCE}/lists`);
  return { success: true, listId: data.id as string };
}

export async function deleteEmailList(listId: string): Promise<{ success: true } | Fail> {
  const denied = await requirePermission("email.audience.manage", MANAGE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_lists").delete().eq("id", listId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That list no longer exists." };
  revalidatePath(`${AUDIENCE}/lists`);
  return { success: true };
}

export async function removeEmailListMember(listId: string, memberId: string): Promise<{ success: true } | Fail> {
  const denied = await requirePermission("email.audience.manage", MANAGE_DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_list_members").delete().eq("id", memberId).eq("list_id", listId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "They are no longer on the list." };
  revalidatePath(`${AUDIENCE}/lists/${listId}`);
  return { success: true };
}

export type AddReport = {
  /** Addresses that were leads already. */
  leads: number;
  /** Imported contacts already in the portal. */
  existingContacts: number;
  /** New imported contacts made. */
  newContacts: number;
  /** Put on the list (some may have been on it already). */
  added: number;
  alreadyOnList: number;
  /** Not an address, or a domain that takes no mail. */
  invalid: { value: string; reason: string }[];
  duplicates: number;
  /** On the do-not-email list: added to the list, but no campaign will reach them. */
  suppressed: number;
};

/**
 * Puts people on a list by address. An address that is a lead's joins as that
 * lead; one that is an imported contact joins as them; any other becomes a new
 * imported contact, with the consent given — after its domain is asked whether
 * it takes mail. Shared by the paste box and the spreadsheet import.
 */
async function addAddressesToList(
  listId: string,
  rows: { email: string; fullName?: string | null; country?: string | null; city?: string | null; intake?: string | null }[],
  consent: { source: string; importName: string }
): Promise<AddReport | Fail> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const user = await getCurrentUser();
  const { data: list } = await supabase.from("email_lists").select("id").eq("id", listId).maybeSingle();
  if (!list) return { error: "That list no longer exists." };

  const report: AddReport = { leads: 0, existingContacts: 0, newContacts: 0, added: 0, alreadyOnList: 0, invalid: [], duplicates: 0, suppressed: 0 };
  const emails = rows.map((r) => r.email);

  // Who they are already, read across all leads (not only those this person may see).
  const leadByEmail = new Map<string, string>();
  const contactByEmail = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 300) {
    const chunk = emails.slice(i, i + 300);
    const [{ data: leads }, { data: contacts }] = await Promise.all([
      admin.from("leads").select("id, email").in("email", chunk),
      admin.from("email_contacts").select("id, email").in("email", chunk),
    ]);
    for (const l of leads ?? []) {
      const e = normalizeEmail(l.email as string);
      if (e && !leadByEmail.has(e)) leadByEmail.set(e, l.id as string);
    }
    for (const c of contacts ?? []) contactByEmail.set(c.email as string, c.id as string);
  }
  // Leads stored with capitals or spaces are not found by .in(); look those up one by one.
  const missing = emails.filter((e) => !leadByEmail.has(e) && !contactByEmail.has(e));
  for (const e of missing.slice(0, 200)) {
    const { data } = await admin.from("leads").select("id").ilike("email", e).limit(1);
    if (data?.[0]) leadByEmail.set(e, data[0].id as string);
  }

  // A brand-new address is asked whether its domain takes mail at all.
  const newOnes = rows.filter((r) => !leadByEmail.has(r.email) && !contactByEmail.has(r.email));
  const domainOk = await checkDomains(newOnes.map((r) => r.email.split("@")[1]));
  const toCreate = newOnes.filter((r) => {
    const ok = domainOk.get(r.email.split("@")[1]);
    if (ok === false) report.invalid.push({ value: r.email, reason: "its domain takes no email" });
    return ok !== false;
  });
  for (let i = 0; i < toCreate.length; i += 200) {
    const chunk = toCreate.slice(i, i + 200);
    const { data, error } = await supabase
      .from("email_contacts")
      .insert(
        chunk.map((r) => ({
          email: r.email,
          full_name: r.fullName ?? null,
          country_of_interest: r.country ?? null,
          city: r.city ?? null,
          intake: r.intake ?? null,
          source: consent.importName,
          created_by: user?.id ?? null,
        }))
      )
      .select("id, email");
    if (error) return { error: error.message };
    for (const c of data ?? []) contactByEmail.set(c.email as string, c.id as string);
    report.newContacts += data?.length ?? 0;
  }
  // Their consent, recorded once per address; an address already on file keeps what it has.
  if (toCreate.length) {
    await supabase
      .from("email_contact_status")
      .upsert(
        toCreate.map((r) => ({ email: r.email, consent_source: consent.source, consent_at: new Date().toISOString() })),
        { onConflict: "email", ignoreDuplicates: true }
      );
  }

  const memberRows: { list_id: string; lead_id: string | null; contact_id: string | null; added_by: string | null }[] = [];
  for (const r of rows) {
    const leadId = leadByEmail.get(r.email);
    const contactId = leadId ? undefined : contactByEmail.get(r.email);
    if (leadId) report.leads += 1;
    else if (contactId && !toCreate.some((t) => t.email === r.email)) report.existingContacts += 1;
    if (leadId || contactId) memberRows.push({ list_id: listId, lead_id: leadId ?? null, contact_id: leadId ? null : (contactId ?? null), added_by: user?.id ?? null });
  }
  const { data: existing } = await supabase.from("email_list_members").select("lead_id, contact_id").eq("list_id", listId);
  const onList = new Set((existing ?? []).map((m) => (m.lead_id ? `l:${m.lead_id}` : `c:${m.contact_id}`)));
  const fresh = memberRows.filter((m) => !onList.has(m.lead_id ? `l:${m.lead_id}` : `c:${m.contact_id}`));
  report.alreadyOnList = memberRows.length - fresh.length;
  for (let i = 0; i < fresh.length; i += 500) {
    const { data, error } = await supabase.from("email_list_members").insert(fresh.slice(i, i + 500)).select("id");
    if (error) return { error: error.message };
    report.added += data?.length ?? 0;
  }

  const { data: states } = await admin.from("email_contact_status").select("email, status").in("email", emails.slice(0, 1000)).neq("status", "subscribed");
  report.suppressed = states?.length ?? 0;

  revalidatePath(`${AUDIENCE}/lists`);
  revalidatePath(`${AUDIENCE}/lists/${listId}`);
  return report;
}

/** Addresses pasted into a list's box, one per line or separated by commas. */
export async function addPastedToEmailList(listId: string, _prev: unknown, formData: FormData): Promise<({ success: true; report: AddReport }) | Fail> {
  const denied = await requirePermission("email.audience.manage", MANAGE_DENIED);
  if (denied) return denied;
  const consent = String(formData.get("consent_source") ?? "").trim();
  const raw = String(formData.get("emails") ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return { error: "Paste at least one address." };
  if (raw.length > 2000) return { error: "Paste at most 2,000 addresses at a time; import a spreadsheet for more." };
  const invalid: AddReport["invalid"] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  const rows: { email: string }[] = [];
  for (const value of raw) {
    const email = normalizeEmail(value);
    if (!email) invalid.push({ value, reason: "not an email address" });
    else if (seen.has(email)) duplicates += 1;
    else {
      seen.add(email);
      rows.push({ email });
    }
  }
  const needsConsent = rows.length > 0;
  if (needsConsent && !consent) return { error: "Say where these people agreed to hear from HMARK — for anyone not already a lead." };
  const report = await addAddressesToList(listId, rows, { source: consent || "Added by staff", importName: "Added by hand" });
  if ("error" in report) return report;
  report.invalid.unshift(...invalid);
  report.duplicates += duplicates;
  return { success: true, report };
}

// ------------------------------------------------------------------ spreadsheet import

export type ImportPreview = {
  headers: string[];
  sample: string[][];
  rows: number;
  mapping: ImportMapping;
  /** The staged file's reference, posted again by the import step's own form. */
  fileRef: string;
};

/** Reads an uploaded spreadsheet's header and first rows, and guesses which column is which. */
export async function previewContactImport(_prev: unknown, formData: FormData): Promise<({ success: true; preview: ImportPreview }) | Fail> {
  const denied = await requirePermission("email.audience.manage", MANAGE_DENIED);
  if (denied) return denied;
  const file = await uploadedFile(formData, "file");
  if (!file) return { error: "Choose the CSV file to import." };
  // The import step is a form of its own (React resets a form after its action
  // runs, which clears the file field), so it is handed the reference to post.
  const fileRef = typeof formData.get("file") === "string" ? String(formData.get("file")) : "";
  if (!fileRef) return { error: "The file could not be uploaded for import. Choose it again." };
  const rows = parseCsv(await readCsvFile(file)).filter((r) => r.some((v) => v.trim()));
  if (rows.length < 2) return { error: "The file has no rows under its header." };
  const [headers, ...body] = rows;
  const mapping = guessMapping(headers);
  if (mapping.email === undefined) {
    const guessed = guessEmailColumn(body.slice(0, 50));
    if (guessed !== undefined) mapping.email = guessed;
  }
  return { success: true, preview: { headers, sample: body.slice(0, 5), rows: body.length, mapping, fileRef } };
}

export type ImportReport = AddReport & { rows: number; listId: string };

/** Imports the spreadsheet with the columns as confirmed, into a list (an existing one, or a new one named here). */
export async function commitContactImport(_prev: unknown, formData: FormData): Promise<({ success: true; report: ImportReport }) | Fail> {
  const denied = await requirePermission("email.audience.manage", MANAGE_DENIED);
  if (denied) return denied;
  const file = await uploadedFile(formData, "file");
  if (!file) return { error: "The file could not be read again — choose it again." };
  const consent = String(formData.get("consent_source") ?? "").trim();
  if (!consent) return { error: "Say where these people agreed to hear from HMARK, e.g. “Education Expo Karachi, 2026 sign-up sheet”." };
  if (consent.length > 200) return { error: "Keep the consent note to 200 characters." };

  const mapping: ImportMapping = {};
  for (const f of IMPORT_FIELDS) {
    const v = String(formData.get(`map_${f.key}`) ?? "");
    if (v !== "") mapping[f.key as ImportField] = Number(v);
  }
  if (mapping.email === undefined || Number.isNaN(mapping.email)) return { error: "Choose which column holds the email address." };

  let listId = String(formData.get("list_id") ?? "").trim();
  const newListName = String(formData.get("new_list") ?? "").trim();
  const supabase = await createClient();
  if (!listId) {
    if (!newListName) return { error: "Choose a list to import into, or name a new one." };
    if (newListName.length > 120) return { error: "Keep the list's name to 120 characters." };
    const user = await getCurrentUser();
    const { data, error } = await supabase.from("email_lists").insert({ name: newListName, created_by: user?.id ?? null }).select("id").single();
    if (error) return { error: error.message };
    listId = data.id as string;
  }

  const rows = parseCsv(await readCsvFile(file)).filter((r) => r.some((v) => v.trim()));
  const body = rows.slice(1);
  if (body.length > 50_000) return { error: "Import at most 50,000 rows at a time." };
  const read = readImportRows(body, mapping);
  const report = await addAddressesToList(listId, read.contacts, { source: consent, importName: `${file.name} (${new Date().toISOString().slice(0, 10)})` });
  if ("error" in report) return report;
  report.invalid.unshift(...read.problems.map((p) => ({ value: p.value || `line ${p.line}`, reason: `line ${p.line}: ${p.reason}` })));
  report.duplicates += read.duplicates;
  return { success: true, report: { ...report, rows: body.length, listId } };
}

// ------------------------------------------------------------------ do-not-email

/**
 * Puts addresses on the do-not-email list. An address already unsubscribed,
 * bounced or marked as spam keeps that — the stronger reason.
 */
export async function suppressEmailAddresses(_prev: unknown, formData: FormData): Promise<({ success: true; message: string }) | Fail> {
  const denied = await requirePermission("email.audience.manage", MANAGE_DENIED);
  if (denied) return denied;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why, e.g. “Asked not to be emailed, by phone”." };
  if (reason.length > 200) return { error: "Keep the reason to 200 characters." };
  const raw = String(formData.get("emails") ?? "").split(/[\s,;]+/).filter(Boolean);
  const emails = [...new Set(raw.map((r) => normalizeEmail(r)).filter((e): e is string => Boolean(e)))];
  const bad = raw.filter((r) => !normalizeEmail(r));
  if (!emails.length) return { error: bad.length ? `Not an email address: ${bad.slice(0, 5).join(", ")}.` : "Give at least one address." };
  if (emails.length > 2000) return { error: "At most 2,000 addresses at a time." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: me } = await supabase.from("staff").select("full_name").eq("id", user?.id ?? "").maybeSingle();
  const why = `${reason} — ${me?.full_name ?? "staff"}`;
  const { data: current } = await supabase.from("email_contact_status").select("email, status").in("email", emails);
  const known = new Map((current ?? []).map((c) => [c.email as string, c.status as ContactStatus]));
  const fresh = emails.filter((e) => !known.has(e)).map((email) => ({ email, status: "suppressed", status_reason: why, status_changed_at: new Date().toISOString() }));
  const toUpdate = emails.filter((e) => known.get(e) === "subscribed");
  if (fresh.length) {
    const { error } = await supabase.from("email_contact_status").insert(fresh);
    if (error) return { error: error.message };
  }
  if (toUpdate.length) {
    const { error } = await supabase
      .from("email_contact_status")
      .update({ status: "suppressed", status_reason: why, status_changed_at: new Date().toISOString() })
      .in("email", toUpdate);
    if (error) return { error: error.message };
  }
  const kept = emails.length - fresh.length - toUpdate.length;
  revalidatePath(AUDIENCE);
  revalidatePath(`${AUDIENCE}/suppressed`);
  return {
    success: true,
    message:
      `${fresh.length + toUpdate.length} address${fresh.length + toUpdate.length === 1 ? "" : "es"} added to the do-not-email list.` +
      (kept ? ` ${kept} already on it for a stronger reason (unsubscribed, bounced or marked as spam) and left so.` : "") +
      (bad.length ? ` Not addresses: ${bad.slice(0, 5).join(", ")}.` : ""),
  };
}

/**
 * Takes an address off the do-not-email list — one staff put there, one found
 * invalid, or one that bounced and has since been fixed. Never one the person
 * unsubscribed or marked as spam themselves: only they can undo that, from
 * their preference page.
 */
export async function restoreEmailAddress(email: string): Promise<{ success: true } | Fail> {
  const denied = await requirePermission("email.audience.manage", MANAGE_DENIED);
  if (denied) return denied;
  const e = normalizeEmail(email);
  if (!e) return { error: "Not an email address." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("email_contact_status").select("status").eq("email", e).maybeSingle();
  if (!row || row.status === "subscribed") return { error: "That address is not on the do-not-email list." };
  if (row.status === "unsubscribed" || row.status === "complained") {
    return { error: `${CONTACT_STATUS_LABELS[row.status as ContactStatus]} by the person themselves — only they can undo it, from their email preferences page.` };
  }
  const user = await getCurrentUser();
  const { data: me } = await supabase.from("staff").select("full_name").eq("id", user?.id ?? "").maybeSingle();
  const { error } = await supabase
    .from("email_contact_status")
    .update({ status: "subscribed", status_reason: `Restored by ${me?.full_name ?? "staff"}`, status_changed_at: new Date().toISOString(), soft_bounce_count: 0 })
    .eq("email", e);
  if (error) return { error: error.message };
  revalidatePath(AUDIENCE);
  revalidatePath(`${AUDIENCE}/suppressed`);
  return { success: true };
}

// ------------------------------------------------------------------ looking someone up

export type AudienceLookup = {
  kind: "lead" | "contact";
  id: string;
  name: string;
  email: string | null;
  status: ContactStatus;
  statusReason: string | null;
  consentSource: string;
  consentAt: string | null;
  topics: string[];
  lists: string[];
};

/** Finds leads and imported contacts by name or address, with each address's email state. */
export async function lookUpAudience(query: string): Promise<AudienceLookup[] | Fail> {
  const denied = await requirePermission("page.marketing.email", VIEW_DENIED);
  if (denied) return denied;
  const q = query.trim().replace(/[%,()]/g, " ").slice(0, 80);
  if (q.length < 2) return [];
  const admin = createAdminClient();
  const [{ data: leads }, { data: contacts }] = await Promise.all([
    admin.from("leads").select("id, full_name, email, date_of_inquiry, created_at").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(10),
    admin.from("email_contacts").select("id, full_name, email, source, created_at").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(10),
  ]);
  const people = [
    ...(leads ?? []).map((l) => ({ kind: "lead" as const, id: l.id as string, name: (l.full_name as string) ?? "", email: normalizeEmail(l.email as string), since: (l.date_of_inquiry ?? l.created_at) as string })),
    ...(contacts ?? []).map((c) => ({ kind: "contact" as const, id: c.id as string, name: (c.full_name as string) ?? "", email: normalizeEmail(c.email as string), since: c.created_at as string })),
  ];
  const emails = people.map((p) => p.email).filter((e): e is string => Boolean(e));
  const [{ data: states }, { data: members }] = await Promise.all([
    admin.from("email_contact_status").select("email, status, status_reason, consent_source, consent_at, topics").in("email", emails.length ? emails : ["-"]),
    admin
      .from("email_list_members")
      .select("lead_id, contact_id, list:email_lists(name)")
      .or(
        [
          people.filter((p) => p.kind === "lead").length ? `lead_id.in.(${people.filter((p) => p.kind === "lead").map((p) => p.id).join(",")})` : null,
          people.filter((p) => p.kind === "contact").length ? `contact_id.in.(${people.filter((p) => p.kind === "contact").map((p) => p.id).join(",")})` : null,
        ]
          .filter(Boolean)
          .join(",") || "lead_id.is.null"
      ),
  ]);
  const stateOf = new Map((states ?? []).map((s) => [s.email as string, s]));
  return people.map((p) => {
    const s = p.email ? stateOf.get(p.email) : undefined;
    const lists = (members ?? [])
      .filter((m) => (p.kind === "lead" ? m.lead_id === p.id : m.contact_id === p.id))
      .map((m) => (Array.isArray(m.list) ? m.list[0] : m.list)?.name as string)
      .filter(Boolean);
    return {
      kind: p.kind,
      id: p.id,
      name: p.name || "—",
      email: p.email,
      status: (s?.status as ContactStatus) ?? (p.email ? "subscribed" : "invalid"),
      statusReason: (s?.status_reason as string) ?? (p.email ? null : "No usable email address on the record"),
      consentSource: (s?.consent_source as string) ?? (p.kind === "lead" ? "Enquiry (they contacted HMARK)" : "Imported"),
      consentAt: (s?.consent_at as string) ?? p.since,
      topics: (s?.topics as string[]) ?? [],
      lists,
    };
  });
}
