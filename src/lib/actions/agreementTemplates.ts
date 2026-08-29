"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  return staffRow?.role === "super_admin";
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

  if (file && file.size > 0) {
    const file_path = `agreement-templates/${destination_id}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(file_path, file, { upsert: true });
    if (uploadError) return { error: uploadError.message };
    update.file_path = file_path;
  }

  const { error } = await supabase.from("agreement_templates").update(update).eq("id", templateId);
  if (error) return { error: error.message };

  revalidatePath("/setup/agreement-templates");
  revalidatePath(`/setup/agreement-templates/${templateId}`);
  revalidateTag("agreement-templates", { expire: 0 });
  return { success: true };
}

export async function deleteAgreementTemplate(templateId: string) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can delete agreement templates." };

  const { error } = await supabase.from("agreement_templates").delete().eq("id", templateId);
  if (error) return { error: error.message };

  revalidatePath("/setup/agreement-templates");
  revalidateTag("agreement-templates", { expire: 0 });
  redirect("/setup/agreement-templates");
}
