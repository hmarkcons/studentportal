// End-to-end test of the live Supabase schema/RLS/triggers, run through the
// same Auth + REST/RPC APIs the app itself uses (not a superuser bypass).
// This exists because browser-based click-testing wasn't available when the
// schema was built — it's the substitute, and it already caught 5 real bugs
// that `npm run build`'s type-check could never have found (missing RLS
// policies, a trigger silently no-op'ing under RLS, a bad foreign key).
//
// It does NOT verify that the React pages render correctly or that a form's
// `name` attributes match what its Server Action reads from FormData — only
// an actual browser click-through covers that.
//
// Usage:
//   1. Add to .env.local (never commit real values):
//        E2E_SUPER_ADMIN_EMAIL=<a real active Super Admin's email>
//        E2E_SUPER_ADMIN_PASSWORD=<their password>
//   2. npm run test:e2e
//
// The script creates its own throwaway fixtures (prefixed "ZZTest"/"zztest")
// directly in whatever Supabase project NEXT_PUBLIC_SUPABASE_URL points at,
// and deletes them again in a `finally` block — safe to run against a
// project with real data, but it IS live traffic against that project, not
// a local/sandboxed database.

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
const { createClient } = require("@supabase/supabase-js");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;

if (!URL || !ANON || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
  console.error("Missing E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD in .env.local — see the header comment in this file.");
  process.exit(1);
}

// Service-role client: bypasses RLS, used only for fixture setup/cleanup
// that no single actor role could reasonably do (creating auth users,
// deleting cross-table test data at the end).
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

let passed = 0,
  failed = 0;
function ok(label, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${extra ? " — " + JSON.stringify(extra) : ""}`);
  }
}
function section(title) {
  console.log(`\n== ${title} ==`);
}

function userClient(access_token) {
  return createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${access_token}` } },
  });
}

async function signIn(email, password) {
  const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`);
  return data;
}

const cleanup = { authUserIds: [], destinationId: null, universityId: null, programId: null, leadIdA: null, leadIdB: null, counselorId: null };

async function main() {
  // --- Super Admin login ---
  section("Super Admin login");
  const adminSession = await signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
  ok("super admin signs in", !!adminSession.session);
  const superAdmin = userClient(adminSession.session.access_token);

  // --- Create a test counselor ---
  section("Create test counselor staff account");
  const counselorEmail = `zztest.counselor.${Date.now()}@example.com`;
  const counselorPassword = "TestPass123!9";
  const { data: counselorUser, error: cUserErr } = await admin.auth.admin.createUser({
    email: counselorEmail,
    password: counselorPassword,
    email_confirm: true,
  });
  ok("create counselor auth user", !cUserErr, cUserErr);
  cleanup.authUserIds.push(counselorUser.user.id);
  cleanup.counselorId = counselorUser.user.id;
  const { error: staffInsertErr } = await admin.from("staff").insert({
    id: counselorUser.user.id,
    full_name: "ZZTest Counselor",
    role: "counselor",
    status: "active",
  });
  ok("create staff row for counselor", !staffInsertErr, staffInsertErr);

  const counselorSession = await signIn(counselorEmail, counselorPassword);
  const counselor = userClient(counselorSession.session.access_token);

  // --- Setup data: destination, university, program, agreement template ---
  section("Setup: destination / university / program / agreement template");
  const { data: dest, error: destErr } = await counselor
    .from("destinations")
    .insert({
      country: "ZZTestland",
      country_code: "ZZ",
      track: "public",
      display_name: "ZZTestland (Public)",
      currency: "EUR",
      admin_charge: 300,
      consultancy_fee: 1800,
      pipeline_stages: ["documents_pending", "documents_verified", "application_submitted", "offer_accepted", "enrolled"],
    })
    .select("id, pipeline_stages")
    .single();
  ok("staff can create a destination", !destErr, destErr);
  cleanup.destinationId = dest?.id;

  const { data: uni, error: uniErr } = await counselor
    .from("universities")
    .insert({ destination_id: dest.id, name: "ZZTest University", type: "public" })
    .select("id")
    .single();
  ok("staff can create a university", !uniErr, uniErr);
  cleanup.universityId = uni?.id;

  const { data: program, error: progErr } = await counselor
    .from("programs")
    .insert({ university_id: uni.id, level: "masters", name: "ZZTest MSc Program", tuition_fee: 5000 })
    .select("id")
    .single();
  ok("staff can create a program", !progErr, progErr);
  cleanup.programId = program?.id;

  const { data: template, error: templateErr } = await counselor
    .from("agreement_templates")
    .insert({ destination_id: dest.id, file_path: "templates/zztest.pdf", signatory_name: "ZZTest Director" })
    .select("id")
    .single();
  ok("staff can create an agreement template", !templateErr, templateErr);

  // --- Lead -> Registration ---
  section("Lead creation and registration");
  const { data: lead, error: leadErr } = await counselor
    .from("leads")
    .insert({
      full_name: "ZZTest Student",
      contact_number: "03000000000",
      email: `zztest.student.${Date.now()}@example.com`,
      assigned_counselor_id: counselorUser.user.id,
      status: "potential",
    })
    .select("id, email")
    .single();
  ok("counselor can create a lead", !leadErr, leadErr);
  cleanup.leadIdA = lead?.id;

  const { error: callLogErr } = await counselor
    .from("lead_call_logs")
    .insert({ lead_id: lead.id, counselor_id: counselorUser.user.id, status_at_time: "in_discussion", remark: "First call, interested." });
  ok("counselor can log a call", !callLogErr, callLogErr);

  const { error: regErr } = await counselor.from("leads").update({ status: "registered" }).eq("id", lead.id);
  ok("counselor can register the lead", !regErr, regErr);

  const { data: registeredLead } = await counselor.from("leads").select("registered_at, portal_active").eq("id", lead.id).single();
  ok("registered_at was auto-stamped by the trigger", !!registeredLead?.registered_at, registeredLead);
  ok("portal_active is false before agreement is signed", registeredLead?.portal_active === false, registeredLead);

  // A second, unrelated student for the RLS cross-student boundary check later
  const { data: leadB } = await counselor
    .from("leads")
    .insert({ full_name: "ZZTest Other Student", email: `zztest.other.${Date.now()}@example.com`, assigned_counselor_id: counselorUser.user.id, status: "registered" })
    .select("id")
    .single();
  cleanup.leadIdB = leadB?.id;

  // --- Agreement ---
  section("Agreement generation and signing");
  const { data: agreement, error: agreementErr } = await counselor
    .from("agreements")
    .insert({ student_id: lead.id, template_id: template.id, signing_method: "e_signature", status: "pending_signature" })
    .select("id")
    .single();
  ok("staff can generate an agreement", !agreementErr, agreementErr);

  const filePath = `${lead.id}/agreements/zztest-signed.txt`;
  const { error: uploadErr } = await counselor.storage.from("documents").upload(filePath, new Blob(["signed agreement test content"]), { contentType: "text/plain" });
  ok("staff can upload the signed agreement to storage", !uploadErr, uploadErr);

  const { error: signErr } = await counselor.from("agreements").update({ status: "signed", signed_file_path: filePath, email_verified: true }).eq("id", agreement.id);
  ok("staff can mark the agreement signed", !signErr, signErr);

  const { data: afterSign } = await counselor.from("leads").select("portal_active").eq("id", lead.id).single();
  ok("portal_active flips to true once the agreement is signed (trigger)", afterSign?.portal_active === true, afterSign);

  // --- Invoice ---
  section("Invoice and installments (Finance/Super Admin only)");
  const { error: counselorInvoiceErr } = await counselor
    .from("invoices")
    .insert({ student_id: lead.id, agreement_id: agreement.id, admin_charge: 300, consultancy_fee: 1800, currency: "EUR" });
  ok("a counselor (non-finance) CANNOT generate an invoice", !!counselorInvoiceErr, counselorInvoiceErr);

  const { data: invoice, error: invErr } = await superAdmin
    .from("invoices")
    .insert({ student_id: lead.id, agreement_id: agreement.id, admin_charge: 300, consultancy_fee: 1800, currency: "EUR" })
    .select("id")
    .single();
  ok("Super Admin can generate an invoice", !invErr, invErr);

  const { error: instErr } = await superAdmin.from("invoice_installments").insert([
    { invoice_id: invoice.id, installment_no: 1, amount: 1050, status: "unpaid" },
    { invoice_id: invoice.id, installment_no: 2, amount: 1050, status: "unpaid" },
  ]);
  ok("staff can create invoice installments", !instErr, instErr);

  // --- Application & stage pipeline ---
  section("Application creation and stage pipeline");
  const { data: application, error: appErr } = await counselor
    .from("applications")
    .insert({ student_id: lead.id, university_id: uni.id, program_id: program.id, intake: "Fall 2026" })
    .select("id, current_stage")
    .single();
  ok("staff can create an application", !appErr, appErr);
  ok("default stage is the destination's first pipeline stage", application?.current_stage === "documents_pending", application);

  const { error: invalidStageErr } = await counselor.from("applications").update({ current_stage: "not_a_real_stage" }).eq("id", application.id);
  ok("an invalid stage is rejected by the trigger", !!invalidStageErr, invalidStageErr);

  const { error: validStageErr } = await counselor.from("applications").update({ current_stage: "application_submitted" }).eq("id", application.id);
  ok("a valid configured stage is accepted", !validStageErr, validStageErr);

  const { data: stageHistory } = await counselor.from("application_stage_history").select("stage").eq("application_id", application.id).order("entered_at");
  ok("stage transitions are logged to application_stage_history", (stageHistory ?? []).some((s) => s.stage === "application_submitted"), stageHistory);

  // --- Documents ---
  section("Document upload, review, and audit logging");
  const { data: doc, error: docErr } = await counselor
    .from("student_documents")
    .insert({ student_id: lead.id, application_id: application.id, category: "admission", status: "missing" })
    .select("id")
    .single();
  ok("staff can add a document requirement", !docErr, docErr);

  const docPath = `${lead.id}/${doc.id}-passport.txt`;
  await counselor.storage.from("documents").upload(docPath, new Blob(["fake passport scan"]), { contentType: "text/plain" });
  const { error: submitErr } = await counselor.from("student_documents").update({ file_path: docPath, status: "submitted", uploaded_by_role: "staff" }).eq("id", doc.id);
  ok("staff can mark a document submitted", !submitErr, submitErr);

  const { error: verifyErr } = await counselor.from("student_documents").update({ status: "verified" }).eq("id", doc.id);
  ok("staff can verify a document", !verifyErr, verifyErr);

  const { data: auditRowsForCounselor } = await counselor.from("audit_log").select("id").limit(1);
  ok("a counselor (non-super-admin) cannot read the audit log (RLS)", (auditRowsForCounselor ?? []).length === 0, auditRowsForCounselor);
  const { data: auditRows } = await superAdmin.from("audit_log").select("id, entity_type").eq("entity_type", "student_documents").order("created_at", { ascending: false }).limit(5);
  ok("document verification is captured in the audit log (visible to Super Admin)", (auditRows ?? []).length > 0, auditRows);

  // --- Encrypted credentials round-trip ---
  section("Encrypted credentials");
  const { error: storeErr } = await counselor.rpc("store_credential", {
    p_owner_type: "application",
    p_owner_id: application.id,
    p_credential_type: "vfs_appointment",
    p_plaintext: JSON.stringify({ username: "zztest", password: "secret123" }),
  });
  ok("staff can store an encrypted credential", !storeErr, storeErr);
  const { data: readBack, error: readErr } = await counselor.rpc("read_credential", {
    p_owner_type: "application",
    p_owner_id: application.id,
    p_credential_type: "vfs_appointment",
  });
  ok("staff can read back the credential (round-trip)", !readErr && JSON.parse(readBack).password === "secret123", { readErr, readBack });

  // --- Student portal login + RLS boundary checks ---
  section("Student portal access + RLS boundaries");
  const studentPassword = "StudentPass123!9";
  const { data: studentAuthUser, error: studentAuthErr } = await admin.auth.admin.createUser({ email: lead.email, password: studentPassword, email_confirm: true });
  ok("admin can create the student's portal auth account", !studentAuthErr, studentAuthErr);
  cleanup.authUserIds.push(studentAuthUser.user.id);
  const { error: linkErr } = await counselor.from("leads").update({ auth_user_id: studentAuthUser.user.id }).eq("id", lead.id);
  ok("staff can link the auth account to the student record", !linkErr, linkErr);

  const studentSession = await signIn(lead.email, studentPassword);
  const student = userClient(studentSession.session.access_token);

  const { data: ownProfile } = await student.from("students").select("id, full_name").eq("auth_user_id", studentAuthUser.user.id).maybeSingle();
  ok("student can see their own registered-student record", ownProfile?.id === lead.id, ownProfile);

  const { data: ownApp } = await student.from("applications").select("id, current_stage").eq("id", application.id).maybeSingle();
  ok("student can see their own application", ownApp?.id === application.id, ownApp);

  const { data: otherStudentAttempt } = await student.from("leads").select("id").eq("id", leadB.id).maybeSingle();
  ok("student CANNOT see an unrelated student's lead row (RLS)", otherStudentAttempt === null, otherStudentAttempt);

  const { error: studentVerifyAttemptErr } = await student.from("student_documents").update({ status: "rejected" }).eq("id", doc.id);
  const { data: docAfterAttempt } = await counselor.from("student_documents").select("status").eq("id", doc.id).single();
  ok("student CANNOT change a document to rejected/verified (RLS with-check blocks it)", !!studentVerifyAttemptErr && docAfterAttempt?.status === "verified", { studentVerifyAttemptErr, docAfterAttempt });

  const { data: ownCredentialRead, error: ownCredentialErr } = await student.rpc("read_credential", { p_owner_type: "application", p_owner_id: application.id, p_credential_type: "vfs_appointment" });
  ok("the owning student CAN read their own application's stored credential", !ownCredentialErr && JSON.parse(ownCredentialRead).password === "secret123", { ownCredentialErr, ownCredentialRead });

  const { data: doc2, error: doc2Err } = await counselor.from("student_documents").insert({ student_id: lead.id, application_id: application.id, category: "visa", status: "missing" }).select("id").single();
  ok("staff can add a second document requirement", !doc2Err, doc2Err);
  const doc2Path = `${lead.id}/${doc2.id}-visa-doc.txt`;
  await student.storage.from("documents").upload(doc2Path, new Blob(["visa doc from student"]), { contentType: "text/plain" });
  const { error: studentSubmitErr } = await student.from("student_documents").update({ file_path: doc2Path, status: "submitted", uploaded_by_role: "student" }).eq("id", doc2.id);
  const { data: doc2AfterSubmit } = await counselor.from("student_documents").select("status, file_path").eq("id", doc2.id).single();
  ok("student CAN submit their own document (status=submitted)", !studentSubmitErr && doc2AfterSubmit?.status === "submitted" && doc2AfterSubmit?.file_path === doc2Path, { studentSubmitErr, doc2AfterSubmit });

  // --- Partner portal ---
  section("Partner portal: self-registration, approval, scoped access");
  const partnerEmail = `zztest.partner.${Date.now()}@example.com`;
  const partnerPassword = "PartnerPass123!9";
  const { data: partnerSignup, error: partnerSignupErr } = await admin.auth.admin.createUser({ email: partnerEmail, password: partnerPassword, email_confirm: true });
  ok("partner auth account can be created", !partnerSignupErr, partnerSignupErr);
  cleanup.authUserIds.push(partnerSignup.user.id);

  const partnerSelfSession = await signIn(partnerEmail, partnerPassword);
  const partnerSelf = userClient(partnerSelfSession.session.access_token);
  const { error: partnerAccountErr } = await partnerSelf.from("partner_university_accounts").insert({ id: partnerSignup.user.id, university_id: uni.id, staff_name: "ZZTest Partner Contact" });
  ok("partner can self-register (creates a pending account)", !partnerAccountErr, partnerAccountErr);

  const { data: pendingCheck } = await partnerSelf.from("partner_university_accounts").select("status").eq("id", partnerSignup.user.id).single();
  ok("self-registered partner account starts pending", pendingCheck?.status === "pending", pendingCheck);

  const { data: prematureRpc } = await partnerSelf.rpc("get_partner_applications");
  ok("a pending (unapproved) partner sees no applications via the RPC", (prematureRpc ?? []).length === 0, prematureRpc);

  const { error: approveErr } = await superAdmin.from("partner_university_accounts").update({ status: "active" }).eq("id", partnerSignup.user.id);
  ok("Super Admin can approve the pending partner account", !approveErr, approveErr);

  const { data: partnerApps, error: partnerAppsErr } = await partnerSelf.rpc("get_partner_applications");
  ok("an approved partner sees applications for their own university via the RPC", !partnerAppsErr && (partnerApps ?? []).some((a) => a.application_id === application.id), { partnerAppsErr, partnerApps });
  const partnerAppRow = (partnerApps ?? []).find((a) => a.application_id === application.id);
  ok("summary-mode university hides student email/phone in the RPC output", partnerAppRow && partnerAppRow.student_email === null, partnerAppRow);

  const { error: partnerStageUpdateErr } = await partnerSelf.from("applications").update({ current_stage: "offer_accepted" }).eq("id", application.id);
  const { data: stageAfterPartnerUpdate } = await superAdmin.from("applications").select("current_stage").eq("id", application.id).single();
  ok("partner can update the application's current_stage (verified persisted, not just no-error)", !partnerStageUpdateErr && stageAfterPartnerUpdate?.current_stage === "offer_accepted", { partnerStageUpdateErr, stageAfterPartnerUpdate });

  const offerLetterPath = `${lead.id}/${application.id}-offer_letter-test.txt`;
  const { error: partnerUploadErr } = await partnerSelf.storage.from("documents").upload(offerLetterPath, new Blob(["offer letter"]), { contentType: "text/plain" });
  const { error: partnerDocInsertErr } = await partnerSelf
    .from("student_documents")
    .insert({ student_id: lead.id, application_id: application.id, category: "offer_letter", file_path: offerLetterPath, status: "submitted", uploaded_by_role: "partner" });
  ok("partner can upload an offer letter against the application", !partnerUploadErr && !partnerDocInsertErr, { partnerUploadErr, partnerDocInsertErr });

  const { data: commission, error: commissionSetupErr } = await superAdmin
    .from("partner_commissions")
    .insert({ student_id: lead.id, application_id: application.id, expected_amount: 500, currency: "EUR", status: "pending" })
    .select("id")
    .single();
  ok("Super Admin can create a partner commission record", !commissionSetupErr, commissionSetupErr);
  const { data: partnerCommissionView, error: partnerCommissionViewErr } = await partnerSelf.from("partner_commissions").select("id, status").eq("id", commission.id).maybeSingle();
  ok("partner can see their own university's commission record", !partnerCommissionViewErr && partnerCommissionView?.id === commission.id, { partnerCommissionViewErr, partnerCommissionView });
  const proofPath = `${commission.id}/proof-test.txt`;
  await partnerSelf.storage.from("documents").upload(proofPath, new Blob(["payment proof"]), { contentType: "text/plain" });
  const { error: partnerProofErr } = await partnerSelf.from("partner_commissions").update({ payment_proof_path: proofPath }).eq("id", commission.id);
  const { data: commissionAfterProof } = await superAdmin.from("partner_commissions").select("payment_proof_path").eq("id", commission.id).single();
  ok("partner can upload commission payment proof (verified persisted)", !partnerProofErr && commissionAfterProof?.payment_proof_path === proofPath, { partnerProofErr, commissionAfterProof });

  const { error: partnerEscalationErr } = await partnerSelf.from("applications").update({ current_stage: "enrolled", student_id: leadB.id }).eq("id", application.id);
  ok("partner CANNOT reassign an application to a different student (restrict trigger)", !!partnerEscalationErr, partnerEscalationErr);

  const { error: partnerCredentialErr } = await partnerSelf.rpc("read_credential", { p_owner_type: "application", p_owner_id: application.id, p_credential_type: "vfs_appointment" });
  ok("partner CANNOT read the application's encrypted credential (not staff, not the student)", !!partnerCredentialErr, partnerCredentialErr);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

async function cleanupAll() {
  // Service-role client bypasses RLS, same role a superuser DB connection
  // would play — no direct Postgres connection needed for cleanup.
  if (cleanup.leadIdA) await admin.from("leads").delete().eq("id", cleanup.leadIdA);
  if (cleanup.leadIdB) await admin.from("leads").delete().eq("id", cleanup.leadIdB);
  if (cleanup.programId) await admin.from("programs").delete().eq("id", cleanup.programId);
  if (cleanup.universityId) await admin.from("universities").delete().eq("id", cleanup.universityId);
  if (cleanup.destinationId) await admin.from("destinations").delete().eq("id", cleanup.destinationId);
  if (cleanup.counselorId) {
    await admin.from("encrypted_credentials").delete().eq("updated_by", cleanup.counselorId);
    await admin.from("audit_log").delete().eq("actor_id", cleanup.counselorId);
    await admin.from("login_events").delete().eq("staff_id", cleanup.counselorId);
    await admin.from("staff").delete().eq("id", cleanup.counselorId);
  }
  for (const id of cleanup.authUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log("\ncleanup done");
}

main()
  .catch((e) => {
    console.error("\nTEST SCRIPT ERROR:", e.message);
    failed++;
    process.exitCode = 1;
  })
  .finally(() => cleanupAll().catch((e) => console.error("cleanup error:", e.message)));
