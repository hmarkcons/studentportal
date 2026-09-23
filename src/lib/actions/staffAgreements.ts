"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { staffRoles } from "@/lib/auth/roles";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/lib/constants";
import { COMPENSATION_COLUMNS } from "@/lib/staffCompensation";
import { validateDocumentFile, sanitizeFilename } from "@/lib/documentUpload";
import { wordingToBlocks, DEFAULT_OFFICE_LINE } from "@/lib/pdf/templateWording";
import {
  missingMergeFields,
  staffMergeVars,
  unknownMergeFields,
  type OfficePolicy,
  type PayForAgreement,
  type StaffForAgreement,
} from "@/lib/staffAgreementFields";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import {
  staffAgreementHtml,
  staffAgreementSubject,
  staffAgreementText,
  type StaffAgreementMail,
} from "@/lib/staffAgreementEmail";

// Staff agreements (0271). Two permissions, both a Super Admin's until granted
// to a role on the Role Permissions screen:
//
//   staff_agreements.templates  what the contract says
//   staff_agreements.manage     issuing, filing, verifying
//
// Every action checks its permission first, and the tables' and bucket's own
// policies check the same permission again on every write — the database is
// the check that binds.

const TEMPLATES = "staff_agreements.templates" as const;
const MANAGE = "staff_agreements.manage" as const;

type Result = { error: string; success?: undefined } | { success: true; error?: undefined; message?: string };

const PATHS = ["/setup/agreement-templates", "/setup/agreement-generator", "/admin/staff", "/my-agreement"];
function refresh() {
  for (const p of PATHS) revalidatePath(p);
}

function agreementDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
}

async function mail(to: string | null | undefined, message: StaffAgreementMail): Promise<boolean> {
  if (!to) return false;
  const sent = await sendEmail({
    to,
    subject: staffAgreementSubject(message),
    text: staffAgreementText(message),
    html: staffAgreementHtml(message),
  });
  return !("error" in sent && sent.error);
}

// ================================================================ templates

function templateFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    signatory_name: String(formData.get("signatory_name") ?? "").trim(),
    wording: String(formData.get("wording") ?? "").trim(),
  };
}

/**
 * A placeholder that is not a staff field would reach the PDF as literal
 * braces — usually one carried over from a student template. Refused on save,
 * when it is one word to fix, not at generation, when a contract is waiting.
 */
function wordingError(wording: string): string | null {
  if (!wording) return "Write the agreement's wording — or import it from a .docx.";
  const unknown = unknownMergeFields(wording);
  if (unknown.length === 0) return null;
  return `These placeholders aren't staff fields, so they would print as they are: ${unknown
    .map((k) => `{{${k}}}`)
    .join(", ")}. Use the ones listed under "Available merge fields".`;
}

async function uploadTemplateFile(supabase: Awaited<ReturnType<typeof createClient>>, file: File | null) {
  if (!file || file.size === 0) return { path: null as string | null };
  const invalid = validateDocumentFile(file, "template");
  if (invalid) return { error: invalid };
  const path = `staff-agreement-templates/${Date.now()}-${sanitizeFilename(file.name)}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  return error ? { error: error.message } : { path };
}

export async function createStaffAgreementTemplate(_prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission(TEMPLATES, "You don't have access to staff agreement templates.");
  if (denied) return denied;

  const fields = templateFields(formData);
  if (!fields.name || !fields.signatory_name) return { error: "A name and the authorised signatory are both required." };
  const wordingIssue = wordingError(fields.wording);
  if (wordingIssue) return { error: wordingIssue };

  const supabase = await createClient();
  const upload = await uploadTemplateFile(supabase, formData.get("file") as File | null);
  if ("error" in upload && upload.error) return { error: upload.error };

  const { staff } = await getStaffSession();
  const { error } = await supabase
    .from("staff_agreement_templates")
    .insert({ ...fields, file_path: upload.path ?? null, created_by: staff?.id ?? null });
  if (error) return { error: error.message };

  refresh();
  return { success: true };
}

export async function updateStaffAgreementTemplate(templateId: string, _prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission(TEMPLATES, "You don't have access to staff agreement templates.");
  if (denied) return denied;

  const fields = templateFields(formData);
  if (!fields.name || !fields.signatory_name) return { error: "A name and the authorised signatory are both required." };
  const wordingIssue = wordingError(fields.wording);
  if (wordingIssue) return { error: wordingIssue };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("staff_agreement_templates")
    .select("file_path")
    .eq("id", templateId)
    .maybeSingle();
  if (!existing) return { error: "That template no longer exists." };

  const upload = await uploadTemplateFile(supabase, formData.get("file") as File | null);
  if ("error" in upload && upload.error) return { error: upload.error };

  const { data: updated, error } = await supabase
    .from("staff_agreement_templates")
    .update({ ...fields, ...(upload.path ? { file_path: upload.path } : {}) })
    .eq("id", templateId)
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "The template wasn't saved — you may no longer have access to it." };

  // The replaced reference file, once nothing points at it.
  if (upload.path && existing.file_path) await supabase.storage.from("documents").remove([existing.file_path]);

  refresh();
  revalidatePath(`/setup/agreement-templates/staff/${templateId}`);
  return { success: true };
}

export async function deleteStaffAgreementTemplate(templateId: string): Promise<Result> {
  const denied = await requirePermission(TEMPLATES, "You don't have access to staff agreement templates.");
  if (denied) return denied;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("staff_agreement_templates")
    .select("file_path")
    .eq("id", templateId)
    .maybeSingle();
  // Agreements already generated from it keep their own PDFs (template_id is
  // set null), so deleting a template never changes a contract.
  const { error } = await supabase.from("staff_agreement_templates").delete().eq("id", templateId);
  if (error) return { error: error.message };
  if (existing?.file_path) await supabase.storage.from("documents").remove([existing.file_path]);

  refresh();
  return { success: true };
}

/**
 * A copy of a template to edit — the way to start a new one from the sample,
 * or a variant of an existing one, without retyping or pasting the wording.
 */
export async function duplicateStaffAgreementTemplate(templateId: string): Promise<Result & { id?: string }> {
  const denied = await requirePermission(TEMPLATES, "You don't have access to staff agreement templates.");
  if (denied) return denied;

  const supabase = await createClient();
  const { data: source } = await supabase
    .from("staff_agreement_templates")
    .select("name, signatory_name, wording")
    .eq("id", templateId)
    .maybeSingle();
  if (!source) return { error: "That template no longer exists." };

  const { staff } = await getStaffSession();
  const { data: created, error } = await supabase
    .from("staff_agreement_templates")
    .insert({
      name: `Copy of ${source.name}`.slice(0, 200),
      signatory_name: source.signatory_name,
      wording: source.wording,
      created_by: staff?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? "Could not copy the template." };

  refresh();
  return { success: true, id: created.id };
}

// =============================================================== agreements

type TemplateRow = { id: string; name: string; signatory_name: string; wording: string };

/**
 * Renders a staff agreement's PDF from its template and the staff member's
 * record as they stand now, and stores it.
 *
 * Refuses rather than rendering a contract with a gap in it: every
 * placeholder the wording uses must have a value on their record.
 */
async function renderStaffAgreementPdf(agreementId: string, staffId: string, template: TemplateRow, createdAt: Date) {
  // The permission was checked by the caller. Their pay is read with the
  // service role because staff_compensation is Super Admin/Finance only, and
  // whoever holds staff_agreements.manage has been trusted to issue contracts
  // that state it — the office's decision when the feature was specified.
  const admin = createAdminClient();
  const [{ data: staff }, { data: pay }, { data: policy }] = await Promise.all([
    admin
      .from("staff")
      .select(
        "full_name, designation, cnic, date_of_birth, gender, marital_status, address, mobile_official, mobile_personal, " +
          "email_official, email_personal, emergency_contact_name, emergency_contact_relation, emergency_contact_number, " +
          "work_start_time, work_end_time, work_days, monthly_target, role, roles"
      )
      .eq("id", staffId)
      .maybeSingle<Omit<StaffForAgreement, "roles"> & { role: string; roles: string[] | null }>(),
    admin.from("staff_compensation").select(COMPENSATION_COLUMNS).eq("staff_id", staffId).maybeSingle<PayForAgreement>(),
    // The office's hours and grace period — the fallback payroll uses too, so
    // what the contract says about attendance is what gets deducted by.
    admin
      .from("attendance_policy")
      .select("work_start_time, work_end_time, work_days, grace_minutes")
      .maybeSingle<OfficePolicy>(),
  ]);
  if (!staff) return { error: "That staff member no longer exists." };

  const dateText = agreementDate(createdAt);
  const vars = staffMergeVars(
    { ...staff, roles: staffRoles(staff).map((r) => STAFF_ROLE_LABELS[r as StaffRole] ?? r) },
    pay ?? null,
    { agreementDate: dateText, signatoryName: template.signatory_name, policy: policy ?? null }
  );
  const missing = missingMergeFields(template.wording, vars);
  if (missing.length > 0) {
    return { error: `Fill these in on ${staff.full_name}'s staff record first — the agreement uses them: ${missing.join("; ")}.` };
  }
  const unknown = unknownMergeFields(template.wording);
  if (unknown.length > 0) {
    return { error: `The template uses placeholders that aren't staff fields: ${unknown.map((k) => `{{${k}}}`).join(", ")}. Fix the template first.` };
  }

  const supabase = await createClient();
  const { data: sigFile } = await supabase.storage.from("documents").download("branding/hmark-signature.png");
  const signatureDataUri = sigFile ? `data:image/png;base64,${Buffer.from(await sigFile.arrayBuffer()).toString("base64")}` : null;

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { StaffAgreementDocument } = await import("@/lib/pdf/AgreementDocument");
  const element = createElement(StaffAgreementDocument, {
    data: {
      title: template.name,
      officeLine: DEFAULT_OFFICE_LINE,
      blocks: wordingToBlocks(template.wording, vars, { feeTable: false }),
      staff: {
        fullName: staff.full_name,
        designation: staff.designation,
        cnic: staff.cnic,
        dob: vars.date_of_birth || null,
        email: staff.email_official,
        mobile: vars.mobile || null,
        address: staff.address,
      },
      agreementDate: dateText,
      signatureDataUri,
      signatoryName: template.signatory_name,
    },
  });
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);

  const path = `staff-agreements/${staffId}/${agreementId}-generated.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) return { error: uploadError.message };
  return { path };
}

/** Creates a draft agreement from a template and renders its PDF. */
export async function generateStaffAgreement(staffId: string, _prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission(MANAGE, "You don't have access to staff agreements.");
  if (denied) return denied;

  const templateId = String(formData.get("template_id") ?? "");
  if (!templateId) return { error: "Choose a template." };

  const supabase = await createClient();
  const { data: template } = await supabase
    .from("staff_agreement_templates")
    .select("id, name, signatory_name, wording")
    .eq("id", templateId)
    .maybeSingle<TemplateRow>();
  if (!template) return { error: "That template no longer exists." };

  const { staff: actor } = await getStaffSession();
  const { data: created, error } = await supabase
    .from("staff_agreements")
    .insert({ staff_id: staffId, template_id: template.id, title: template.name, generated_by: actor?.id ?? null })
    .select("id, created_at")
    .single();
  if (error || !created) return { error: error?.message ?? "Could not create the agreement." };

  const rendered = await renderStaffAgreementPdf(created.id, staffId, template, new Date(created.created_at));
  if ("error" in rendered && rendered.error) {
    // Nothing half-made is left behind: a draft with no PDF is not an agreement.
    await supabase.from("staff_agreements").delete().eq("id", created.id);
    return { error: rendered.error };
  }
  await supabase.from("staff_agreements").update({ pdf_path: rendered.path }).eq("id", created.id);

  refresh();
  return { success: true, message: "Generated — review the PDF, then send it to them to sign." };
}

/** Re-renders an agreement from its template and the record as it is now — before anyone has signed it. */
export async function regenerateStaffAgreementPdf(agreementId: string): Promise<Result> {
  const denied = await requirePermission(MANAGE, "You don't have access to staff agreements.");
  if (denied) return denied;

  const supabase = await createClient();
  const { data: agreement } = await supabase
    .from("staff_agreements")
    .select("id, staff_id, status, created_at, template:staff_agreement_templates(id, name, signatory_name, wording)")
    .eq("id", agreementId)
    .maybeSingle();
  if (!agreement) return { error: "That agreement no longer exists." };
  if (agreement.status === "submitted" || agreement.status === "signed") {
    return { error: "It has already been signed, so its PDF can't change. Generate a new agreement instead." };
  }
  const template = (Array.isArray(agreement.template) ? agreement.template[0] : agreement.template) as TemplateRow | null;
  if (!template) return { error: "Its template has been deleted, so it can't be regenerated." };

  const rendered = await renderStaffAgreementPdf(agreement.id, agreement.staff_id, template, new Date(agreement.created_at));
  if ("error" in rendered && rendered.error) return { error: rendered.error };
  await supabase.from("staff_agreements").update({ pdf_path: rendered.path }).eq("id", agreementId);

  refresh();
  return { success: true };
}

/** Shows a draft to its staff member and mails them to sign it. */
export async function sendStaffAgreementForSigning(agreementId: string): Promise<Result> {
  const denied = await requirePermission(MANAGE, "You don't have access to staff agreements.");
  if (denied) return denied;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("staff_agreements")
    .update({ status: "awaiting_signature", sent_at: new Date().toISOString() })
    .eq("id", agreementId)
    .eq("status", "draft")
    .not("pdf_path", "is", null)
    .select("id, title, staff_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!updated) return { error: "Only a generated draft can be sent — this one has been sent already, or has no PDF." };

  const { staff: actor } = await getStaffSession();
  const { data: member } = await createAdminClient()
    .from("staff")
    .select("full_name, email_official")
    .eq("id", updated.staff_id)
    .maybeSingle();
  const emailed = await mail(member?.email_official, {
    kind: "sent",
    staffName: member?.full_name ?? "",
    title: updated.title,
    url: `${getSiteUrl()}/my-agreement`,
    issuedBy: actor?.full_name ?? null,
  });

  refresh();
  return {
    success: true,
    message: emailed ? `Sent — emailed to ${member?.email_official}.` : "Sent — it's in their portal. The email didn't go, so tell them.",
  };
}

/**
 * Files a signed agreement on a staff member's record: the signed copy of one
 * already generated, or — with no agreementId — an agreement signed outside
 * the portal, uploaded as it is. Either way it is signed on arrival: the
 * person uploading it is the one who would have verified it.
 */
export async function uploadSignedStaffAgreement(
  staffId: string,
  agreementId: string | null,
  _prev: unknown,
  formData: FormData
): Promise<Result> {
  const denied = await requirePermission(MANAGE, "You don't have access to staff agreements.");
  if (denied) return denied;

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose the signed agreement to upload." };
  const invalid = validateDocumentFile(file, "agreement");
  if (invalid) return { error: invalid };
  const title = String(formData.get("title") ?? "").trim();
  if (!agreementId && !title) return { error: "Give it a title, e.g. \"Employment Agreement 2026\"." };

  const supabase = await createClient();
  const path = `staff-agreements/${staffId}/signed/${Date.now()}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  if (uploadError) return { error: uploadError.message };

  const { staff: actor } = await getStaffSession();
  const signed = {
    status: "signed",
    signed_file_path: path,
    verified_by: actor?.id ?? null,
    verified_at: new Date().toISOString(),
    rejection_note: null,
  };
  const { error } = agreementId
    ? await supabase.from("staff_agreements").update(signed).eq("id", agreementId).eq("staff_id", staffId)
    : await supabase
        .from("staff_agreements")
        .insert({ staff_id: staffId, title, source: "uploaded", generated_by: actor?.id ?? null, ...signed });
  if (error) {
    await supabase.storage.from("documents").remove([path]);
    return { error: error.message };
  }

  refresh();
  return { success: true };
}

/** Accepts the signed copy a staff member returned. */
export async function verifyStaffAgreement(agreementId: string): Promise<Result> {
  const denied = await requirePermission(MANAGE, "You don't have access to staff agreements.");
  if (denied) return denied;

  const { staff: actor } = await getStaffSession();
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("staff_agreements")
    .update({ status: "signed", verified_by: actor?.id ?? null, verified_at: new Date().toISOString() })
    .eq("id", agreementId)
    .eq("status", "submitted")
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "There's no returned copy waiting to be verified." };

  refresh();
  return { success: true };
}

/** Sends a returned copy back, saying why, and asks for another. */
export async function sendBackStaffAgreement(agreementId: string, note: string): Promise<Result> {
  const denied = await requirePermission(MANAGE, "You don't have access to staff agreements.");
  if (denied) return denied;
  const reason = note.trim();
  if (!reason) return { error: "Say what needs fixing — they'll see this note." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("staff_agreements")
    .select("signed_file_path, title, staff_id, status")
    .eq("id", agreementId)
    .maybeSingle();
  if (!before || before.status !== "submitted") return { error: "There's no returned copy to send back." };

  const { error } = await supabase
    .from("staff_agreements")
    .update({ status: "awaiting_signature", signed_file_path: null, submitted_at: null, rejection_note: reason })
    .eq("id", agreementId)
    .eq("status", "submitted");
  if (error) return { error: error.message };
  if (before.signed_file_path) await supabase.storage.from("documents").remove([before.signed_file_path]);

  const { data: member } = await createAdminClient()
    .from("staff")
    .select("full_name, email_official")
    .eq("id", before.staff_id)
    .maybeSingle();
  await mail(member?.email_official, {
    kind: "sentBack",
    staffName: member?.full_name ?? "",
    title: before.title,
    url: `${getSiteUrl()}/my-agreement`,
    note: reason,
  });

  refresh();
  return { success: true };
}

export async function deleteStaffAgreement(agreementId: string): Promise<Result> {
  const denied = await requirePermission(MANAGE, "You don't have access to staff agreements.");
  if (denied) return denied;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("staff_agreements")
    .select("pdf_path, signed_file_path")
    .eq("id", agreementId)
    .maybeSingle();
  const { error } = await supabase.from("staff_agreements").delete().eq("id", agreementId);
  if (error) return { error: error.message };
  const files = [before?.pdf_path, before?.signed_file_path].filter((p): p is string => Boolean(p));
  if (files.length) await supabase.storage.from("documents").remove(files);

  refresh();
  return { success: true };
}

// ================================================================ their own

/**
 * A staff member returns the signed copy of an agreement sent to them.
 *
 * The upload lands in their own folder (their storage policy allows that
 * and nothing more), and submit_staff_agreement() — the one write they have
 * on the table — attaches it, only to their own agreement and only while it
 * is waiting for them. Whoever issued it is then told.
 */
export async function submitMySignedAgreement(agreementId: string, _prev: unknown, formData: FormData): Promise<Result> {
  const { staff: me } = await getStaffSession();
  if (!me) return { error: "Sign in again." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose your signed copy to upload." };
  const invalid = validateDocumentFile(file, "agreement");
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const path = `staff-agreements/${me.id}/returned/${agreementId}-${Date.now()}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  if (uploadError) return { error: "Your signed copy couldn't be uploaded — this agreement may not be waiting for you any more." };

  const { error } = await supabase.rpc("submit_staff_agreement", { p_agreement_id: agreementId, p_signed_path: path });
  if (error) {
    // They may not delete from their folder, so the stray upload is removed with the service role.
    await createAdminClient().storage.from("documents").remove([path]);
    return { error: error.message };
  }

  // Tell whoever issued it; failing that, every Super Admin.
  const admin = createAdminClient();
  const { data: agreement } = await admin
    .from("staff_agreements")
    .select("title, generated_by")
    .eq("id", agreementId)
    .maybeSingle();
  const { data: issuer } = agreement?.generated_by
    ? await admin.from("staff").select("full_name, email_official, status").eq("id", agreement.generated_by).maybeSingle()
    : { data: null };
  const recipients =
    issuer?.email_official && issuer.status === "active"
      ? [issuer]
      : ((await admin.from("staff").select("full_name, email_official, status").contains("roles", ["super_admin"]).eq("status", "active")).data ?? []);
  for (const r of recipients) {
    await mail(r.email_official, {
      kind: "returned",
      recipientName: r.full_name,
      staffName: me.full_name,
      title: agreement?.title ?? "Staff agreement",
      url: `${getSiteUrl()}/setup/agreement-generator?tab=staff&staff=${me.id}`,
    });
  }

  refresh();
  return { success: true };
}

// ============================================================ the panel data

export type StaffAgreementView = {
  id: string;
  title: string;
  status: "draft" | "awaiting_signature" | "submitted" | "signed";
  source: "generated" | "uploaded";
  hasTemplate: boolean;
  createdAt: string;
  sentAt: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectionNote: string | null;
  pdfUrl: string | null;
  signedUrl: string | null;
};

type AgreementRow = {
  id: string;
  title: string;
  status: StaffAgreementView["status"];
  source: StaffAgreementView["source"];
  template_id: string | null;
  created_at: string;
  sent_at: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  rejection_note: string | null;
  pdf_path: string | null;
  signed_file_path: string | null;
};

const AGREEMENT_COLUMNS =
  "id, title, status, source, template_id, created_at, sent_at, submitted_at, verified_at, rejection_note, pdf_path, signed_file_path";

async function withLinks(supabase: Awaited<ReturnType<typeof createClient>>, rows: AgreementRow[]): Promise<StaffAgreementView[]> {
  const link = async (path: string | null) =>
    path ? ((await supabase.storage.from("documents").createSignedUrl(path, 3600)).data?.signedUrl ?? null) : null;
  return Promise.all(
    rows.map(async (a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      source: a.source,
      hasTemplate: Boolean(a.template_id),
      createdAt: a.created_at,
      sentAt: a.sent_at,
      submittedAt: a.submitted_at,
      verifiedAt: a.verified_at,
      rejectionNote: a.rejection_note,
      pdfUrl: await link(a.pdf_path),
      signedUrl: await link(a.signed_file_path),
    }))
  );
}

/** Everything the agreements panel shows for one staff member, for someone who may manage them. */
export async function loadStaffAgreementPanel(
  staffId: string
): Promise<{ error: string } | { agreements: StaffAgreementView[]; templates: { id: string; name: string }[] }> {
  const denied = await requirePermission(MANAGE, "You don't have access to staff agreements.");
  if (denied) return denied;

  const supabase = await createClient();
  const [{ data: rows, error }, { data: templates }] = await Promise.all([
    supabase
      .from("staff_agreements")
      .select(AGREEMENT_COLUMNS)
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false })
      .returns<AgreementRow[]>(),
    supabase.from("staff_agreement_templates").select("id, name").order("name"),
  ]);
  if (error) return { error: error.message };
  return { agreements: await withLinks(supabase, rows ?? []), templates: templates ?? [] };
}

/** A staff member's own agreements — never a draft; RLS decides that, not this. */
export async function loadMyAgreements(): Promise<StaffAgreementView[]> {
  const { staff: me } = await getStaffSession();
  if (!me) return [];
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("staff_agreements")
    .select(AGREEMENT_COLUMNS)
    .eq("staff_id", me.id)
    .order("created_at", { ascending: false })
    .returns<AgreementRow[]>();
  return withLinks(supabase, rows ?? []);
}
