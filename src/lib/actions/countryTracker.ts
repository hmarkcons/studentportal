"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TrackerFieldDef, TrackerFieldType } from "@/lib/countryTrackers";

type TrackerDefinitionRow = {
  id: string;
  country_code: string;
  field_key: string;
  label: string;
  field_type: TrackerFieldType;
  options: string[] | null;
  credential_type: string | null;
  show_if_key: string | null;
  show_if_equals: string | null;
  date_when_status: string | null;
  sort_order: number;
};

function rowToFieldDef(r: TrackerDefinitionRow): TrackerFieldDef {
  return {
    id: r.id,
    key: r.field_key,
    label: r.label,
    type: r.field_type,
    options: r.options ?? undefined,
    credentialType: r.credential_type ?? undefined,
    showWhen: r.show_if_key ? { key: r.show_if_key, equals: r.show_if_equals ?? "" } : undefined,
    dateWhenStatus: r.date_when_status ?? undefined,
    sortOrder: r.sort_order,
  };
}

export async function listTrackerDefinitions(countryCodes: string[]): Promise<Record<string, TrackerFieldDef[]>> {
  if (countryCodes.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("tracker_definitions")
    .select("id, country_code, field_key, label, field_type, options, credential_type, show_if_key, show_if_equals, date_when_status, sort_order")
    .in("country_code", countryCodes)
    .order("sort_order", { ascending: true })
    .returns<TrackerDefinitionRow[]>();

  const byCountry: Record<string, TrackerFieldDef[]> = {};
  for (const row of data ?? []) {
    (byCountry[row.country_code] ??= []).push(rowToFieldDef(row));
  }
  return byCountry;
}

export async function listTrackerCountries(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("tracker_definitions").select("country_code");
  return Array.from(new Set((data ?? []).map((r) => r.country_code))).sort();
}

async function requireSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  return staffRow?.role === "super_admin";
}

export async function createTrackerField(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can edit document trackers." };

  const country_code = String(formData.get("country_code") ?? "").trim().toUpperCase();
  const field_key = String(formData.get("field_key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const field_type = String(formData.get("field_type") ?? "");
  const optionsRaw = String(formData.get("options") ?? "").trim();
  const credential_type = String(formData.get("credential_type") ?? "").trim() || null;
  const show_if_key = String(formData.get("show_if_key") ?? "").trim() || null;
  const show_if_equals = String(formData.get("show_if_equals") ?? "").trim() || null;
  const date_when_status = String(formData.get("date_when_status") ?? "").trim() || null;
  const sort_order = Number(formData.get("sort_order") ?? 0);

  if (!country_code || !field_key || !label || !field_type) {
    return { error: "Country, field key, label, and type are required." };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(field_key)) {
    return { error: "Field key must be lowercase letters, numbers, and underscores, starting with a letter." };
  }

  const options = optionsRaw
    ? optionsRaw
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : null;

  const { error } = await supabase.from("tracker_definitions").insert({
    country_code,
    field_key,
    label,
    field_type,
    options,
    credential_type,
    show_if_key,
    show_if_equals,
    date_when_status,
    sort_order,
  });

  if (error) return { error: error.message };

  revalidatePath("/setup/document-trackers");
  return { success: true };
}

export async function updateTrackerField(id: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can edit document trackers." };

  const label = String(formData.get("label") ?? "").trim();
  const field_type = String(formData.get("field_type") ?? "");
  const optionsRaw = String(formData.get("options") ?? "").trim();
  const credential_type = String(formData.get("credential_type") ?? "").trim() || null;
  const show_if_key = String(formData.get("show_if_key") ?? "").trim() || null;
  const show_if_equals = String(formData.get("show_if_equals") ?? "").trim() || null;
  const date_when_status = String(formData.get("date_when_status") ?? "").trim() || null;
  const sort_order = Number(formData.get("sort_order") ?? 0);

  if (!label || !field_type) return { error: "Label and type are required." };

  const options = optionsRaw
    ? optionsRaw
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : null;

  const { error } = await supabase
    .from("tracker_definitions")
    .update({ label, field_type, options, credential_type, show_if_key, show_if_equals, date_when_status, sort_order })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/setup/document-trackers");
  return { success: true };
}

export async function deleteTrackerField(id: string) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can edit document trackers." };

  const { error } = await supabase.from("tracker_definitions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/setup/document-trackers");
  return { success: true };
}

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

export async function listCredentialTypesAction(ownerType: "student" | "application", ownerId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_credential_types", { p_owner_type: ownerType, p_owner_id: ownerId });
  if (error || !data) return [];
  return data as string[];
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
