"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveTrackerFields(
  applicationId: string,
  revalidateTo: string,
  fieldKeys: { key: string; type: string }[],
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rows = fieldKeys.map(({ key, type }) => ({
    application_id: applicationId,
    field_key: key,
    field_value: type === "boolean" ? String(formData.get(key) === "on") : String(formData.get(key) ?? ""),
    updated_by: user?.id,
  }));

  const { error } = await supabase.from("application_country_extra").upsert(rows, { onConflict: "application_id,field_key" });

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function storeCredentialAction(
  ownerType: "student" | "application",
  ownerId: string,
  credentialType: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!username && !password) return { error: "Enter a username and/or password." };

  const plaintext = JSON.stringify({ username, password });
  const { error } = await supabase.rpc("store_credential", {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_credential_type: credentialType,
    p_plaintext: plaintext,
  });

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function readCredentialAction(ownerType: "student" | "application", ownerId: string, credentialType: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("read_credential", {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_credential_type: credentialType,
  });

  if (error || !data) return null;

  try {
    return JSON.parse(data) as { username: string; password: string };
  } catch {
    return { username: data as string, password: "" };
  }
}
