"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TrackerFieldDef, TrackerFieldType } from "@/lib/countryTrackers";
import { requirePermission } from "@/lib/auth/permissions";

type TrackerDefinitionRow = {
  id: string;
  country_code: string;
  field_key: string;
  label: string;
  field_type: TrackerFieldType;
  options: string[] | null;
  credential_type: string | null;
  show_on_student_visa?: boolean | null;
  visa_role?: string | null;
  is_appointment?: boolean | null;
  show_if_key: string | null;
  show_if_equals: string | null;
  date_when_status: string | null;
  is_finalized_university?: boolean | null;
  sort_order: number;
};

function rowToFieldDef(r: TrackerDefinitionRow): TrackerFieldDef {
  return {
    id: r.id,
    key: r.field_key,
    label: r.label,
    type: r.field_type,
    options: r.options ?? undefined,
    showWhen: r.show_if_key ? { key: r.show_if_key, equals: r.show_if_equals ?? "" } : undefined,
    dateWhenStatus: r.date_when_status ?? undefined,
    showOnStudentVisa: r.show_on_student_visa ?? false,
    visaRole: (r.visa_role ?? null) as "outcome" | "outcome_reason" | null,
    isAppointment: r.is_appointment ?? false,
    isFinalizedUniversity: r.is_finalized_university ?? false,
    sortOrder: r.sort_order,
  };
}

export async function listTrackerDefinitions(countryCodes: string[]): Promise<Record<string, TrackerFieldDef[]>> {
  if (countryCodes.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("tracker_definitions")
    .select("id, country_code, field_key, label, field_type, options, credential_type, show_if_key, show_if_equals, date_when_status, show_on_student_visa, visa_role, is_appointment, is_finalized_university, sort_order")
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

export async function createTrackerField(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("document_trackers.manage", "Only Super Admin can edit document trackers.");
  if (denied) return { error: denied.error };

  const country_code = String(formData.get("country_code") ?? "").trim().toUpperCase();
  const field_key = String(formData.get("field_key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const field_type = String(formData.get("field_type") ?? "");
  const optionsRaw = String(formData.get("options") ?? "").trim();
  const credential_type = String(formData.get("credential_type") ?? "").trim() || null;
  const show_if_key = String(formData.get("show_if_key") ?? "").trim() || null;
  const show_if_equals = String(formData.get("show_if_equals") ?? "").trim() || null;
  const date_when_status = String(formData.get("date_when_status") ?? "").trim() || null;
  const show_on_student_visa = formData.get("show_on_student_visa") === "on";
  const visaRoleRaw = String(formData.get("visa_role") ?? "").trim();
  const visa_role = visaRoleRaw === "outcome" || visaRoleRaw === "outcome_reason" ? visaRoleRaw : null;
  // Constrained to date fields in the schema, so drop the flag rather than
  // letting the insert fail on a check violation staff cannot interpret.
  const is_appointment = formData.get("is_appointment") === "on" && field_type === "date";
  // The field that records which university the student is proceeding with.
  // A select, because its choices are that student's own applications.
  const is_finalized_university = formData.get("is_finalized_university") === "on" && field_type === "select";
  const sort_order = Number(formData.get("sort_order") ?? 0);

  if (!country_code || !field_key || !label || !field_type) {
    return { error: "Country, field key, label, and type are required." };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(field_key)) {
    return { error: "Field key must be lowercase letters, numbers, and underscores, starting with a letter." };
  }

  // Every tracker must record the finalised university, and the first field
  // added for a country is where that is settled — otherwise a tracker can be
  // built, used, and only later found to be missing the one field the visa
  // step depends on.
  const { data: siblings } = await supabase
    .from("tracker_definitions")
    .select("id, is_finalized_university")
    .eq("country_code", country_code);
  const isFirstField = (siblings ?? []).length === 0;
  const alreadyHasFinalized = (siblings ?? []).some((f) => f.is_finalized_university);

  if (isFirstField && !is_finalized_university) {
    return {
      error:
        'Start this tracker with the field that records the finalised university: choose type Select, leave the options blank, and tick "records the finalised university". Everything else can follow.',
    };
  }
  if (is_finalized_university && alreadyHasFinalized) {
    return { error: "This country already has a field recording the finalised university — only one can." };
  }
  if (formData.get("is_finalized_university") === "on" && field_type !== "select") {
    return { error: "The finalised-university field has to be a Select — its choices are the student's own applications." };
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
    show_on_student_visa,
    visa_role,
    is_appointment,
    is_finalized_university,
    sort_order,
  });

  if (error) return { error: error.message };

  revalidatePath("/setup/document-trackers");
  return { success: true };
}

export async function updateTrackerField(id: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const denied = await requirePermission("document_trackers.manage", "Only Super Admin can edit document trackers."); if (denied) return { error: denied.error };

  const label = String(formData.get("label") ?? "").trim();
  const field_type = String(formData.get("field_type") ?? "");
  const optionsRaw = String(formData.get("options") ?? "").trim();
  const credential_type = String(formData.get("credential_type") ?? "").trim() || null;
  const show_if_key = String(formData.get("show_if_key") ?? "").trim() || null;
  const show_if_equals = String(formData.get("show_if_equals") ?? "").trim() || null;
  const date_when_status = String(formData.get("date_when_status") ?? "").trim() || null;
  const show_on_student_visa = formData.get("show_on_student_visa") === "on";
  const visaRoleRaw = String(formData.get("visa_role") ?? "").trim();
  const visa_role = visaRoleRaw === "outcome" || visaRoleRaw === "outcome_reason" ? visaRoleRaw : null;
  // Constrained to date fields in the schema, so drop the flag rather than
  // letting the insert fail on a check violation staff cannot interpret.
  const is_appointment = formData.get("is_appointment") === "on" && field_type === "date";
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
    .update({ label, field_type, options, credential_type, show_if_key, show_if_equals, date_when_status, show_on_student_visa, visa_role, is_appointment, sort_order })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/setup/document-trackers");
  return { success: true };
}

export async function deleteTrackerField(id: string) {
  const supabase = await createClient();
  const denied = await requirePermission("document_trackers.manage", "Only Super Admin can edit document trackers."); if (denied) return { error: denied.error };

  // Mandatory at creation is only half a rule if it can be deleted after.
  // The last field for a country may go — that removes the tracker entirely,
  // which is a different decision and a legitimate one.
  const { data: field } = await supabase
    .from("tracker_definitions")
    .select("country_code, is_finalized_university")
    .eq("id", id)
    .maybeSingle();
  if (field?.is_finalized_university) {
    const { count } = await supabase
      .from("tracker_definitions")
      .select("id", { count: "exact", head: true })
      .eq("country_code", field.country_code);
    if ((count ?? 0) > 1) {
      return {
        error:
          "This is the field that records the finalised university, which every tracker needs. Delete the rest of this country's fields first if you are removing the tracker altogether.",
      };
    }
  }

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

  // The finalised university is filled from the finalised application and
  // shown read-only (0163). The form leaves it out, but the key list is a
  // bound argument and so is client-supplied — a crafted save could otherwise
  // blank it or point it at another university.
  const submittedKeys = fieldKeys.map((f) => f.key);
  const { data: readOnlyRows } = submittedKeys.length
    ? await supabase
        .from("tracker_definitions")
        .select("field_key")
        .in("field_key", submittedKeys)
        .eq("is_finalized_university", true)
    : { data: [] };
  const readOnly = new Set((readOnlyRows ?? []).map((r) => r.field_key));

  const rows = fieldKeys
    .filter(({ key }) => !readOnly.has(key))
    .map(({ key, type }) => ({
      application_id: applicationId,
      field_key: key,
      field_value: type === "boolean" ? String(formData.get(key) === "on") : String(formData.get(key) ?? ""),
      updated_by: user?.id,
    }));

  if (rows.length === 0) {
    revalidatePath(revalidateTo);
    return { success: true };
  }

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
