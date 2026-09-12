"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { amountError, readAmount } from "@/lib/marketing";

const PAGE = "/marketing/referrals";

/** A row that vanished under RLS rather than failing loudly. */
const REFUSED = "That change was refused — you may not have permission for it.";

function text(formData: FormData, key: string, max = 200): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  return raw.slice(0, max);
}

/**
 * Adds an outside referring party — a sub-agent, or anyone else who sends us
 * students and is paid for it.
 *
 * Not a staff member: a staff member's own commission is staff_commissions,
 * and confusing the two is how somebody ends up paid twice for one student.
 */
export async function createReferralParty(_prevState: unknown, formData: FormData) {
  const denied = await requirePermission(
    "marketing.referrals.manage",
    "Only Finance or Super Admin can add a referring party."
  );
  if (denied) return { error: denied.error };

  const full_name = text(formData, "full_name", 120);
  if (!full_name) return { error: "The referring party's name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referral_parties")
    .insert({
      full_name,
      organisation: text(formData, "organisation", 160),
      contact_number: text(formData, "contact_number", 40),
      email: text(formData, "email", 160),
      city: text(formData, "city", 80),
      cnic: text(formData, "cnic", 40),
      bank_name: text(formData, "bank_name", 120),
      account_title: text(formData, "account_title", 120),
      account_number: text(formData, "account_number", 60),
      notes: text(formData, "notes", 1000),
    })
    .select("id")
    .single();

  if (error) {
    // Two rows for one person is two sets of bank details, and a payment sent
    // to whichever one was opened first.
    if (error.code === "23505") {
      return { error: "That name and phone number is already on file as a referring party." };
    }
    return { error: error.message };
  }

  revalidatePath(PAGE);
  return { success: true, id: data.id };
}

/** Corrects a party's details — including the account the money goes to. */
export async function updateReferralParty(id: string, _prevState: unknown, formData: FormData) {
  const denied = await requirePermission(
    "marketing.referrals.manage",
    "Only Finance or Super Admin can edit a referring party."
  );
  if (denied) return { error: denied.error };

  const full_name = text(formData, "full_name", 120);
  if (!full_name) return { error: "The referring party's name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referral_parties")
    .update({
      full_name,
      organisation: text(formData, "organisation", 160),
      contact_number: text(formData, "contact_number", 40),
      email: text(formData, "email", 160),
      city: text(formData, "city", 80),
      cnic: text(formData, "cnic", 40),
      bank_name: text(formData, "bank_name", 120),
      account_title: text(formData, "account_title", 120),
      account_number: text(formData, "account_number", 60),
      notes: text(formData, "notes", 1000),
      is_active: formData.get("is_active") !== null,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === "23505") return { error: "Another party is already on file with that name and phone number." };
    return { error: error.message };
  }
  if (!data?.length) return { error: REFUSED };

  revalidatePath(PAGE);
  return { success: true };
}

/**
 * Logs that a party referred a student, and what they are owed for it.
 *
 * The student is a registered one: a referral is paid on a registration, so
 * until the lead registers there is nothing to owe anybody.
 */
export async function createPartyReferral(_prevState: unknown, formData: FormData) {
  const denied = await requirePermission(
    "marketing.referrals.manage",
    "Only Finance or Super Admin can log a referral."
  );
  if (denied) return { error: denied.error };

  const referral_party_id = String(formData.get("referral_party_id") ?? "");
  const lead_id = String(formData.get("lead_id") ?? "");
  if (!referral_party_id) return { error: "Choose the referring party." };
  if (!lead_id) return { error: "Choose the registered student they referred." };

  const invalid = amountError(formData.get("incentive_owed"), "commission");
  if (invalid) return { error: invalid };
  const incentive_owed = readAmount(formData.get("incentive_owed"));

  const supabase = await createClient();

  // The party's name is copied onto the referral as it stood when it was
  // logged — the row keeps saying who was credited even if the party is later
  // renamed, and referrer_name is not nullable.
  const { data: party } = await supabase.from("referral_parties").select("full_name").eq("id", referral_party_id).maybeSingle();
  if (!party) return { error: "That referring party is no longer on file." };

  // Paid on a registration, so refuse one that has not happened. Checked here
  // rather than left to the form's own list, since the id is client-supplied.
  const { data: student } = await supabase
    .from("leads")
    .select("id, registration_status, registered_at")
    .eq("id", lead_id)
    .maybeSingle();
  if (!student) return { error: "That student could not be found." };
  if (student.registration_status !== "registered" || !student.registered_at) {
    return { error: "A referral commission is paid on a registration — that student is not registered." };
  }

  const { error } = await supabase.from("referrals").insert({
    lead_id,
    referral_party_id,
    referrer_name: party.full_name,
    incentive_owed,
    currency: String(formData.get("currency") ?? "PKR") || "PKR",
    notes: text(formData, "notes", 1000),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That party is already logged against this student, so nobody will be paid twice." };
    }
    return { error: error.message };
  }

  revalidatePath(PAGE);
  return { success: true };
}

/**
 * Records the payment of one referral commission, or takes it back.
 *
 * The date is not optional when marking it paid: a payment nobody can date is
 * a payment nobody can reconcile, and the table refuses one either way.
 */
export async function setReferralPayment(id: string, _prevState: unknown, formData: FormData) {
  const denied = await requirePermission(
    "marketing.referral_incentives",
    "Only Finance or Super Admin can record a referral payment."
  );
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const markPaid = String(formData.get("incentive_status") ?? "") === "paid";

  if (!markPaid) {
    // Unpaying clears the payment details with it. Leaving a reference behind
    // on an unpaid row is how a payment gets recorded twice.
    const { data, error } = await supabase
      .from("referrals")
      .update({ incentive_status: "owed", paid_on: null, payment_method: null, payment_reference: null, paid_by: null })
      .eq("id", id)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: REFUSED };
    revalidatePath(PAGE);
    return { success: true };
  }

  const paid_on = String(formData.get("paid_on") ?? "").trim();
  if (!paid_on) return { error: "Enter the date the payment was made." };

  const { data: row } = await supabase.from("referrals").select("incentive_owed").eq("id", id).maybeSingle();
  if (row && (row.incentive_owed === null || Number(row.incentive_owed) <= 0)) {
    return { error: "Set what this referral is worth before marking it paid." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("referrals")
    .update({
      incentive_status: "paid",
      paid_on,
      payment_method: text(formData, "payment_method", 60),
      payment_reference: text(formData, "payment_reference", 120),
      paid_by: user?.id ?? null,
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: REFUSED };

  revalidatePath(PAGE);
  return { success: true };
}
