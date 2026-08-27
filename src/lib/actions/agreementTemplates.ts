"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createAgreementTemplate(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const destination_id = String(formData.get("destination_id") ?? "");
  const signatory_name = String(formData.get("signatory_name") ?? "").trim();
  const file = formData.get("file") as File | null;

  if (!destination_id || !signatory_name || !file || file.size === 0) {
    return { error: "Destination, signatory name, and a template file are all required." };
  }

  const path = `agreement-templates/${destination_id}-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.from("agreement_templates").insert({ destination_id, signatory_name, file_path: path });
  if (error) return { error: error.message };

  revalidatePath("/setup/agreement-templates");
  revalidateTag("agreement-templates", { expire: 0 });
  return { success: true };
}

export async function deleteAgreementTemplate(templateId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("agreement_templates").delete().eq("id", templateId);
  if (error) return { error: error.message };

  revalidatePath("/setup/agreement-templates");
  revalidateTag("agreement-templates", { expire: 0 });
  return { success: true };
}
