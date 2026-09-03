"use server";

// Profile data the scope doc calls out under "Student / Applicant Profile
// Management" (beyond what's gathered at registration) that had schema but
// no UI at all: a profile photo, test scores, travel history, and any prior
// visa refusal/deportation record. RLS already covers both staff and the
// student's own self-service access for every table/column touched here
// (student_profiles_write, student_test_scores_write — both
// staff-or-self, migration 0009), so — like qualifications.ts — these
// actions are shared as-is by both the staff-side and portal-side Profile
// pages; no route-specific permission check needed.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const TEST_TYPES = ["ielts", "toefl", "pte", "duolingo", "langcert", "ib", "moi", "gre", "sat", "other"] as const;

export async function addTestScore(studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const test_type = String(formData.get("test_type") ?? "");
  if (!(TEST_TYPES as readonly string[]).includes(test_type)) return { error: "Choose a valid test type." };
  const score = String(formData.get("score") ?? "").trim();
  const test_date = String(formData.get("test_date") ?? "") || null;
  if (!score) return { error: "Enter a score." };

  const { error } = await supabase.from("student_test_scores").insert({ student_id: studentId, test_type, score, test_date });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteTestScore(scoreId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("student_test_scores").delete().eq("id", scoreId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function uploadStudentPhoto(studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a photo to upload." };
  if (!file.type.startsWith("image/")) return { error: "Choose an image file." };

  const path = `${studentId}/photo-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.from("student_profiles").upsert({ student_id: studentId, photo_path: path }, { onConflict: "student_id" });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

type JsonArrayColumn = "travel_history" | "visa_refusal_history";

async function readJsonArray(supabase: SupabaseClient, studentId: string, column: JsonArrayColumn): Promise<Record<string, unknown>[]> {
  const { data } = await supabase.from("student_profiles").select(column).eq("student_id", studentId).maybeSingle();
  const value = (data as Record<string, unknown> | null)?.[column];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

async function appendJsonRecord(studentId: string, column: JsonArrayColumn, record: Record<string, unknown>) {
  const supabase = await createClient();
  const existing = await readJsonArray(supabase, studentId, column);
  const next = [...existing, { id: crypto.randomUUID(), ...record }];
  const { error } = await supabase.from("student_profiles").upsert({ student_id: studentId, [column]: next }, { onConflict: "student_id" });
  return error;
}

async function removeJsonRecord(studentId: string, column: JsonArrayColumn, recordId: string) {
  const supabase = await createClient();
  const existing = await readJsonArray(supabase, studentId, column);
  const next = existing.filter((r) => r.id !== recordId);
  const { error } = await supabase.from("student_profiles").update({ [column]: next }).eq("student_id", studentId);
  return error;
}

export async function addTravelRecord(studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const country = String(formData.get("country") ?? "").trim();
  if (!country) return { error: "Country is required." };
  const purpose = String(formData.get("purpose") ?? "").trim() || null;
  const from_date = String(formData.get("from_date") ?? "") || null;
  const to_date = String(formData.get("to_date") ?? "") || null;

  const error = await appendJsonRecord(studentId, "travel_history", { country, purpose, from_date, to_date });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteTravelRecord(studentId: string, recordId: string, revalidateTo: string) {
  const error = await removeJsonRecord(studentId, "travel_history", recordId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function addVisaRefusalRecord(studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const country = String(formData.get("country") ?? "").trim();
  if (!country) return { error: "Country is required." };
  const type = String(formData.get("type") ?? "refusal");
  if (!["refusal", "deportation"].includes(type)) return { error: "Choose a valid record type." };
  const date = String(formData.get("date") ?? "") || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const error = await appendJsonRecord(studentId, "visa_refusal_history", { country, type, date, reason });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteVisaRefusalRecord(studentId: string, recordId: string, revalidateTo: string) {
  const error = await removeJsonRecord(studentId, "visa_refusal_history", recordId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
