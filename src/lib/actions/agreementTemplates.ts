"use server";

import { hasRole } from "@/lib/auth/roles";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateDocumentFile } from "@/lib/documentUpload";

async function requireSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  return hasRole(staffRow, "super_admin");
}

export async function createAgreementTemplate(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can create agreement templates." };

  const destination_id = String(formData.get("destination_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const signatory_name = String(formData.get("signatory_name") ?? "").trim();
  const wording = String(formData.get("wording") ?? "").trim();
  const file = formData.get("file") as File | null;

  if (!destination_id || !name || !signatory_name) {
    return { error: "Destination, name, and signatory name are all required." };
  }

  let file_path: string | null = null;
  if (file && file.size > 0) {
    const tooLarge = validateDocumentFile(file, "template");
    if (tooLarge) return { error: tooLarge };
    file_path = `agreement-templates/${destination_id}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(file_path, file, { upsert: true });
    if (uploadError) return { error: uploadError.message };
  }

  const { error } = await supabase.from("agreement_templates").insert({ destination_id, name, signatory_name, wording, file_path });
  if (error) return { error: error.message };

  revalidatePath("/setup/agreement-templates");
  revalidateTag("agreement-templates", { expire: 0 });
  return { success: true };
}

export async function updateAgreementTemplate(templateId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can edit agreement templates." };

  const destination_id = String(formData.get("destination_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const signatory_name = String(formData.get("signatory_name") ?? "").trim();
  const wording = String(formData.get("wording") ?? "").trim();
  const file = formData.get("file") as File | null;

  if (!destination_id || !name || !signatory_name) {
    return { error: "Destination, name, and signatory name are all required." };
  }

  const update: Record<string, unknown> = { destination_id, name, signatory_name, wording };

  // What the template points at now, read before anything replaces it, so the
  // old object can be cleaned up afterwards.
  let previousPath: string | null = null;

  if (file && file.size > 0) {
    // The same size check create() applies. Without it the edit form was a way
    // round the limit entirely.
    const tooLarge = validateDocumentFile(file, "template");
    if (tooLarge) return { error: tooLarge };

    const { data: existing } = await supabase
      .from("agreement_templates")
      .select("file_path")
      .eq("id", templateId)
      .maybeSingle();
    previousPath = existing?.file_path ?? null;

    const file_path = `agreement-templates/${destination_id}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(file_path, file, { upsert: true });
    if (uploadError) return { error: uploadError.message };
    update.file_path = file_path;
  }

  const { error } = await supabase.from("agreement_templates").update(update).eq("id", templateId);
  if (error) return { error: error.message };

  // Only once the row points at the new file. Each upload gets its own
  // timestamped path, so replacing a template used to leave the previous
  // document in the bucket for ever — production had four copies of Sweden's
  // and two of Australia's, roughly 26 MB of files nothing referenced.
  //
  // A failure here is logged rather than returned: the template has already
  // been updated successfully, and refusing the edit because a stale file
  // could not be tidied would be the wrong trade.
  if (previousPath && previousPath !== update.file_path) {
    const { error: removeError } = await supabase.storage.from("documents").remove([previousPath]);
    if (removeError) {
      console.error("[updateAgreementTemplate] could not remove the replaced file:", previousPath, removeError.message);
    }
  }

  revalidatePath("/setup/agreement-templates");
  revalidatePath(`/setup/agreement-templates/${templateId}`);
  revalidateTag("agreement-templates", { expire: 0 });
  return { success: true };
}

export async function deleteAgreementTemplate(templateId: string) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can delete agreement templates." };

  // Read the path before the row goes, because afterwards there is nothing left
  // to find it from. Deleting a template used to leave its uploaded document in
  // the bucket permanently.
  const { data: existing } = await supabase
    .from("agreement_templates")
    .select("file_path")
    .eq("id", templateId)
    .maybeSingle();

  const { error } = await supabase.from("agreement_templates").delete().eq("id", templateId);
  if (error) return { error: error.message };

  // After the row, so a failed delete cannot destroy the file of a template
  // that still exists. Logged rather than returned: the template is already
  // gone and there is nothing useful for the user to do about a stale object.
  if (existing?.file_path) {
    const { error: removeError } = await supabase.storage.from("documents").remove([existing.file_path]);
    if (removeError) {
      console.error("[deleteAgreementTemplate] could not remove the template file:", existing.file_path, removeError.message);
    }
  }

  revalidatePath("/setup/agreement-templates");
  revalidateTag("agreement-templates", { expire: 0 });
  redirect("/setup/agreement-templates");
}
