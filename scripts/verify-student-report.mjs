// The status report, end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:studentreport
//
//   * the "Status report (PDF)" button on a registered student's Dashboard
//     downloads a PDF named for the student and the day;
//   * its first page has the student, how much is done, one bar per section,
//     what needs attention (an overdue instalment) and what is coming up
//     (an interview); its pages are numbered;
//   * every section is in it, and each item reads as it stands: a document
//     approved (and by whom), one sent back (and why), one missing; a paid
//     and an overdue instalment, and the invoice's figures; a signed
//     agreement; the application, its interview and test; an overdue task and
//     a follow-up; and the internal remarks, the student's and the
//     application's;
//   * a finance colleague gets it without the visa and travel sections, and
//     says so; a counsellor who follows the student's stages only is refused
//     it and is not offered the button; nobody signed out gets a PDF.
//
// Everything is named zztmp and removed in a finally.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:studentreport");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const RUN = Date.now().toString(36);
const day = (offset) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

// The words a react-pdf PDF draws in the standard fonts: WinAnsi bytes as hex
// in TJ arrays, with the few WinAnsi codes Latin-1 lacks put back.
const WIN_ANSI = { 0x80: "€", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—" };
function pdfText(buf) {
  const text = buf.toString("latin1");
  let content = "";
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(text))) {
    const len = Number((/\/Length (\d+)/.exec(m[1]) || [])[1]);
    if (/\/Subtype \/Image|\/Length1/.test(m[1])) continue;
    const raw = buf.subarray(m.index + m[0].length, m.index + m[0].length + len);
    try {
      content += (/FlateDecode/.test(m[1]) ? inflateSync(raw) : raw).toString("latin1") + "\n";
    } catch {
      /* not text */
    }
  }
  const runs = [];
  for (const tj of content.matchAll(/\[([^\]]*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
    const hexes = tj[1] !== undefined ? [...tj[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]) : [tj[2]];
    runs.push(hexes.map((h) => [...Buffer.from(h, "hex")].map((b) => WIN_ANSI[b] ?? String.fromCharCode(b)).join("")).join(""));
  }
  return { isPdf: text.startsWith("%PDF"), flat: runs.join(" ").replace(/\s+/g, " ") };
}

const around = (text, word) => {
  const at = text.indexOf(word);
  return at === -1 ? `no "${word}" in: ${text.slice(0, 300)}` : text.slice(Math.max(0, at - 160), at + 200);
};

let browser = null;

try {
  const sup = await fx.staff(`report${RUN}`, ["super_admin"]);
  const fin = await fx.staff(`reportfin${RUN}`, ["finance"]);
  const counsellor = await fx.staff(`reportcoun${RUN}`, ["counselor"]);

  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  const { data: uni } = await admin.from("universities").select("id, name").eq("destination_id", italy.id).order("name").limit(1).single();
  const { data: template } = await admin.from("agreement_templates").select("id").eq("destination_id", italy.id).limit(1).single();

  // No intake, on purpose: an intake would take a real Student ID in the
  // running order. The report says why there is none.
  const name = `zztmp Report ${RUN}`;
  const studentId = await fx.lead({
    full_name: name,
    email: `zztmp-report-${RUN}@example.invalid`,
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    country_of_interest: italy.display_name,
    level_applying_for: "bachelors",
    assigned_counselor_id: counsellor.id,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });
  const { data: app } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id }).select("id").single();

  const fixturesMade = [];
  const made = async (label, query) => {
    const { error } = await query;
    if (error) fixturesMade.push(`${label}: ${error.message}`);
  };
  await made("agreement", admin.from("agreements").insert({ student_id: studentId, template_id: template.id, destination_id: italy.id, signing_method: "paper", status: "signed", version: 1 }));
  const { data: invoice } = await admin
    .from("invoices")
    .insert({ student_id: studentId, consultancy_fee: 1000, admin_charge: 0, currency: "EUR", tax_rate: 0, tax_base: "total", invoice_number: `ZZTMP-${RUN}` })
    .select("id")
    .single();
  await made(
    "instalments",
    admin.from("invoice_installments").insert([
      { invoice_id: invoice.id, installment_no: 1, amount: 600, status: "paid", due_date: day(-20), paid_date: day(-21), payment_method: "Cash" },
      { invoice_id: invoice.id, installment_no: 2, amount: 400, status: "unpaid", due_date: day(-3) },
    ])
  );

  // Documents take their status from their files (0328): one approved, one sent back, one with nothing.
  const { data: docs } = await admin
    .from("student_documents")
    .insert([
      { student_id: studentId, category: "admission", custom_name: `zztmp approved ${RUN}`, status: "missing" },
      { student_id: studentId, category: "admission", custom_name: `zztmp sent back ${RUN}`, status: "missing" },
      { student_id: studentId, category: "admission", custom_name: `zztmp missing ${RUN}`, status: "missing" },
    ])
    .select("id, custom_name");
  const docId = (word) => docs.find((d) => d.custom_name.startsWith(`zztmp ${word}`)).id;
  const now = new Date().toISOString();
  await made(
    "document files",
    admin.from("student_document_files").insert([
      { document_id: docId("approved"), student_id: studentId, file_path: `${studentId}/documents/${docId("approved")}/zztmp/a.pdf`, file_name: "a.pdf", status: "verified", verified_by: sup.id, verified_at: now, uploaded_by_role: "student", uploaded_at: now },
      { document_id: docId("sent back"), student_id: studentId, file_path: `${studentId}/documents/${docId("sent back")}/zztmp/b.pdf`, file_name: "b.pdf", status: "rejected", rejected_reason: `zztmp too blurry ${RUN}`, verified_by: sup.id, verified_at: now, uploaded_by_role: "student", uploaded_at: now },
    ])
  );

  const interviewAt = new Date(Date.now() + 5 * 86400000);
  interviewAt.setUTCHours(9, 0, 0, 0);
  await made("interview", admin.from("application_interviews").insert({ application_id: app.id, status: "scheduled", confirmed_datetime: interviewAt.toISOString(), timezone: "Europe/Rome", platform: "zoom", round_label: "Round 1" }));
  await made("task", admin.from("application_tasks").insert({ application_id: app.id, description: `zztmp overdue task ${RUN}`, due_date: day(-2), status: "pending", priority: "urgent" }));
  await made("follow-up", admin.from("reminders").insert({ student_id: studentId, type: "follow_up", due_date: day(4), note: `zztmp follow up ${RUN}`, resolved: false, created_by: sup.id }));
  await made("test score", admin.from("student_test_scores").insert({ student_id: studentId, test_type: "ielts", score: "6.5", test_date: day(-60) }));
  await made("student remark", admin.from("lead_remarks").insert({ lead_id: studentId, body: `zztmp internal note ${RUN}`, written_by: sup.id }));
  await made("application remark", admin.from("application_remarks").insert({ application_id: app.id, body: `zztmp app note ${RUN}`, written_by: sup.id }));
  ok("(the record is set up)", fixturesMade.length === 0, fixturesMade.join("; "));

  // ------------------------------------------------------------ the button, as a Super Admin
  browser = await openBrowser();
  const page = await signIn(browser, sup.email);
  await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  const button = page.locator("[data-student-report]");
  await button.waitFor({ timeout: 120000 });
  await page.waitForFunction(() => {
    const b = document.querySelector("[data-student-report]");
    return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 60000 });
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), button.click()]);
  const file = readFileSync(await download.path());
  const { isPdf, flat } = pdfText(file);
  const today = day(0);

  ok("the Dashboard's button downloads a PDF", isPdf);
  ok("named for the student and the day", download.suggestedFilename() === `HMC-Status-Report-zztmp_Report_${RUN}-${today}.pdf`, download.suggestedFilename());
  ok("the first page names the student", flat.includes("STUDENT STATUS REPORT") && flat.includes(name), flat.slice(0, 300));
  ok("...and says why there is no Student ID", flat.includes("No Student ID yet — no intake recorded"), around(flat, "Student ID"));
  const pages = Number((/Page 1 of (\d+)/.exec(flat) ?? [])[1]);
  ok("its pages are numbered, every one", pages > 1 && flat.includes(`Page ${pages} of ${pages}`), `pages: ${pages}`);

  const SECTIONS = [
    "Registration & profile",
    "Agreement",
    "Invoice & payments",
    "Documents",
    "Applications",
    "Country journey",
    "Documentation tracker",
    "Interviews & tests",
    "Scholarship",
    "Visa",
    "Travel & arrival",
    "Tasks & follow-ups",
    "Internal remarks",
  ];
  const missingSections = SECTIONS.filter((s) => !flat.includes(s));
  ok("every section is in it", missingSections.length === 0, missingSections.join(", "));

  ok("an approved document reads Approved, and who approved it", flat.includes(`Approved zztmp approved ${RUN}`) && flat.includes(`by zztmp report${RUN}`), around(flat, `zztmp approved ${RUN}`));
  ok("a document sent back reads Sent back, with the reason", flat.includes(`Sent back zztmp sent back ${RUN} Reason: zztmp too blurry ${RUN}`), around(flat, `zztmp sent back ${RUN}`));
  ok("a document with nothing sent reads Missing", flat.includes(`Missing zztmp missing ${RUN}`), around(flat, `zztmp missing ${RUN}`));

  ok("a paid instalment reads Paid", flat.includes("Paid Instalment 1 EUR 600.00 · Cash"), around(flat, "Instalment 1"));
  ok("an instalment past its date reads Overdue", flat.includes("Overdue Instalment 2 EUR 400.00 · was due"), around(flat, "Instalment 2"));
  ok("the invoice's figures are set out", flat.includes("Invoice total EUR 1,000.00") && flat.includes("Paid EUR 600.00") && flat.includes("Outstanding EUR 400.00"), around(flat, "Invoice total"));
  ok("a signed agreement reads Signed", /Signed Agreement — Italy/.test(flat), around(flat, "Agreement —"));
  ok("the application is listed, numbered", flat.includes(`#1 ${uni.name}`), around(flat, uni.name));
  ok("its interview reads Scheduled", flat.includes(`Scheduled Interview — ${uni.name} (Round 1)`), around(flat, "Interview —"));
  ok("a test on file reads with its score", flat.includes("Score 6.5 IELTS"), around(flat, "IELTS"));
  ok("a task past its date reads Overdue, with its priority", flat.includes(`Overdue zztmp overdue task ${RUN} ${uni.name} · urgent priority · was due`), around(flat, "zztmp overdue task"));
  ok("a follow-up is listed with its date", /Due \d{1,2} \w+ \d{4} zztmp follow up/.test(flat), around(flat, "zztmp follow up"));
  ok("the internal remarks are in it, the student's and the application's", flat.includes(`zztmp internal note ${RUN}`) && flat.includes(`zztmp app note ${RUN}`), around(flat, "Internal remarks"));
  ok("Needs attention leads with the overdue instalment", flat.includes("Instalment 2 — Overdue"), around(flat, "Needs attention"));
  ok("Coming up has the interview", flat.includes(`Interview — ${uni.name} (Round 1) — Scheduled`), around(flat, "Coming up"));
  ok("a Super Admin's copy has the visa section", flat.includes("The visa process starts once a university is finalized"), around(flat, "Visa"));

  // ------------------------------------------------------------ finance: no visa or travel
  const finContext = await browser.newContext();
  const finPage = await signIn(browser, fin.email, { context: finContext });
  const finResponse = await finPage.request.get(`${BASE}/students/${studentId}/report`, { timeout: 180000 });
  const finText = pdfText(await finResponse.body());
  ok("finance downloads it too", finResponse.status() === 200 && finText.isPdf, `${finResponse.status()}`);
  ok("...with the money in it", finText.flat.includes("Invoice total EUR 1,000.00"));
  ok("...without the visa and travel sections, and says so", !finText.flat.includes("Travel & arrival") && !finText.flat.includes("The visa process starts") && finText.flat.includes("Visa and travel are left out"), around(finText.flat, "left out"));
  await finContext.close();

  // ------------------------------------------------------------ a counsellor following the stages: refused
  const counContext = await browser.newContext();
  const counPage = await signIn(browser, counsellor.email, { context: counContext });
  const counResponse = await counPage.request.get(`${BASE}/students/${studentId}/report`);
  ok("a counsellor who follows the stages only is refused the report", counResponse.status() === 403 && /processing team/.test(await counResponse.text()), `${counResponse.status()}`);
  await counPage.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  // The student's page as a counsellor has it: the name in the header, the stages below.
  await counPage.getByRole("heading", { name }).first().waitFor({ timeout: 120000 });
  ok("...and is not offered the button", (await counPage.locator("[data-student-report]").count()) === 0);
  await counContext.close();

  // ------------------------------------------------------------ signed out: nothing
  const anon = await fetch(`${BASE}/students/${studentId}/report`, { redirect: "manual" });
  ok("nobody signed out gets a PDF", !(anon.headers.get("content-type") ?? "").includes("application/pdf"), `${anon.status} ${anon.headers.get("content-type")}`);
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
