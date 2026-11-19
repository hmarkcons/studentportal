// The reports of 2026-11-18 — end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:newreports
//
//   * Consultancy fee (Finance): a student with an instalment overdue is under
//     Payment overdue and not Paid in full; one fully paid the other way round;
//     the PDF and Excel come down; the Consultancy Fee section has the panel;
//     Processing cannot open it.
//   * Documents (Processing): one student's Missing lists the missing document
//     only, Rejected the one sent back only, Completed not them at all; the
//     panel is on Registered Students and the student's Documents tab, and not
//     there for Management.
//   * Applications (Processing): one student's submitted, pending, rejected and
//     not eligible applications, one under each; the panel is on Applications
//     and the student's Applications tab, not for Management.
//   * Universities and deadlines (Processing): choosing a country lists its
//     universities; a university's CS/IT deadlines (one open, one closing in
//     ten days) without Medicine, and with Bachelors and All programmes,
//     Medicine's closed round; the panel is on Setup › Universities and the
//     university's page; Management cannot open the report.
//
// Everything is named zztmp and removed in a finally.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:newreports");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const UNI = `zztmp Reports University ${RUN}`;
const karachiToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const shift = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function poll(fn, seconds = 45, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

let browser = null;
let universityId = null;
const studentIds = [];

try {
  const today = karachiToday();
  const proc = await fx.staff(`rptproc${RUN}`, ["processing"]);
  const fin = await fx.staff(`rptfin${RUN}`, ["finance"]);
  const mgmt = await fx.staff(`rptmgmt${RUN}`, ["management"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();

  const student = async (label, phone) => {
    const id = await fx.lead({
      full_name: `zztmp Reports ${label} ${RUN}`, email: `zztmp-rpt-${label.toLowerCase()}-${RUN}@hmark-test.local`, contact_number: phone,
      status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
      date_of_inquiry: today, processing_officer_id: proc.id, assigned_counselor_id: proc.id,
      date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", intake: "Fall 2099", level_applying_for: "masters",
      country_of_interest: italy.display_name,
    });
    await admin.from("lead_destinations").insert({ lead_id: id, destination_id: italy.id, is_backup: false });
    studentIds.push(id);
    return id;
  };
  const owing = await student("Owing", "0300-9999948");
  const settled = await student("Settled", "0300-9999949");
  const owingName = `zztmp Reports Owing ${RUN}`;
  const settledName = `zztmp Reports Settled ${RUN}`;

  // The fees: one with an instalment overdue, one paid in full.
  const { data: inv1 } = await admin.from("invoices").insert({ student_id: owing, consultancy_fee: 1000, admin_charge: 0, currency: "PKR" }).select("id").single();
  await admin.from("invoice_installments").insert([
    { invoice_id: inv1.id, installment_no: 1, amount: 500, due_date: shift(today, -40), status: "paid", amount_paid: 500, paid_date: shift(today, -41) },
    { invoice_id: inv1.id, installment_no: 2, amount: 500, due_date: shift(today, -5), status: "unpaid", amount_paid: 0, paid_date: null },
  ]);
  const { data: inv2 } = await admin.from("invoices").insert({ student_id: settled, consultancy_fee: 800, admin_charge: 0, currency: "PKR" }).select("id").single();
  await admin.from("invoice_installments").insert({ invoice_id: inv2.id, installment_no: 1, amount: 800, due_date: shift(today, -10), status: "paid", amount_paid: 800, paid_date: shift(today, -11) });

  // The documents: one missing, one sent back, one approved.
  await admin.from("student_documents").insert([
    { student_id: owing, category: "other", custom_name: `zztmp Missing doc ${RUN}`, status: "missing" },
    { student_id: owing, category: "other", custom_name: `zztmp Rejected doc ${RUN}`, status: "rejected", rejected_reason: "zztmp blurred" },
    { student_id: owing, category: "other", custom_name: `zztmp Approved doc ${RUN}`, status: "verified" },
  ]);

  // The university, its programmes and their rounds; the applications.
  const { data: uni } = await admin.from("universities").insert({ destination_id: italy.id, name: UNI, city: "zztmp City", type: "public" }).select("id").single();
  universityId = uni.id;
  const { data: cs } = await admin.from("programs").insert({ university_id: uni.id, level: "masters", name: `zztmp Computer Science ${RUN}`, core_field: "Computer Science" }).select("id, field_group").single();
  const { data: med } = await admin.from("programs").insert({ university_id: uni.id, level: "bachelors", name: `zztmp Medicine ${RUN}`, core_field: "Medicine and Surgery" }).select("id, field_group").single();
  // One application per programme and round is all the portal allows: two more programmes, masters and
  // outside CS/IT, so the deadline checks below (CS/IT; Bachelors) are not changed by them.
  const { data: econ } = await admin.from("programs").insert({ university_id: uni.id, level: "masters", name: `zztmp Economics ${RUN}`, core_field: "Economics" }).select("id").single();
  const { data: phys } = await admin.from("programs").insert({ university_id: uni.id, level: "masters", name: `zztmp Physics ${RUN}`, core_field: "Physics" }).select("id").single();
  ok("the fixture programmes are classified as expected", cs.field_group === "computer_science" && med.field_group === "medicine", JSON.stringify({ cs: cs.field_group, med: med.field_group }));
  await admin.from("program_intake_rounds").insert([
    { program_id: cs.id, label: "Round 1", application_deadline: shift(today, 60), start_date: shift(today, 300), sort_order: 1 },
    { program_id: cs.id, label: "Round 2", application_deadline: shift(today, 10), start_date: shift(today, 300), sort_order: 2 },
    { program_id: med.id, label: "Main", application_deadline: shift(today, -3), start_date: shift(today, 280), sort_order: 1 },
  ]);
  for (const [stage, prog] of [["application_submitted", cs.id], ["documents_pending", econ.id], ["rejected", med.id], ["declined", phys.id]]) {
    const { error } = await admin.from("applications").insert({ student_id: owing, university_id: uni.id, program_id: prog, intake: "Fall 2099", current_stage: stage });
    if (error) throw new Error(`application ${stage}: ${error.message}`);
  }

  const rowsOf = (page) =>
    page.locator("[data-report-row]").evaluateAll((rows) => rows.map((r) => Object.fromEntries([...r.querySelectorAll("[data-cell]")].map((c) => [c.getAttribute("data-cell"), c.textContent.trim()]))));
  const open = async (page, path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
  };
  const sentAway = (page, path) => poll(async () => (page.url().includes(path) ? null : true), 20);
  const download = async (page, path) => {
    const r = await page.request.get(`${BASE}${path}`);
    const body = await r.body();
    return { ok: r.ok(), type: r.headers()["content-type"] ?? "", head: body.subarray(0, 4).toString("latin1"), name: /filename="([^"]+)"/.exec(r.headers()["content-disposition"] ?? "")?.[1] ?? "" };
  };

  browser = await openBrowser();

  // ------------------------------------------------------------ consultancy fee (Finance)
  const fp = await signIn(browser, fin.email);
  await open(fp, "/reports/consultancy-fee?category=overdue");
  await fp.locator("[data-table-report]").waitFor({ timeout: 120000 });
  let rows = await rowsOf(fp);
  const owingRow = rows.find((r) => r.student === owingName);
  ok("fee: the student with an instalment overdue is under Payment overdue", owingRow?.status === "Payment overdue" && !rows.some((r) => r.student === settledName), JSON.stringify(owingRow));
  ok("...with what is still owed, and since when", owingRow?.outstanding === "PKR 500.00" && owingRow?.instalments === "1 of 2" && owingRow?.overdue !== "—", JSON.stringify(owingRow));
  await open(fp, "/reports/consultancy-fee?category=paid_in_full");
  await fp.locator("[data-table-report]").waitFor({ timeout: 60000 });
  rows = await rowsOf(fp);
  ok("fee: the fully paid student is under Paid in full, the other is not", rows.some((r) => r.student === settledName && r.status === "Paid in full") && !rows.some((r) => r.student === owingName));
  const feePdf = await download(fp, "/reports/consultancy-fee/download?category=overdue&format=pdf");
  const feeXlsx = await download(fp, "/reports/consultancy-fee/download?category=overdue&format=xlsx");
  ok("fee: the PDF and the Excel file come down", feePdf.ok && feePdf.head === "%PDF" && feeXlsx.ok && feeXlsx.head.startsWith("PK") && /Payment overdue/.test(feePdf.name), `${feePdf.name} | ${feeXlsx.name}`);
  await open(fp, "/finance/consultancy-fee");
  ok("fee: the Consultancy Fee section has the report panel", await fp.locator('[data-report-panel="consultancy-fee"]').waitFor({ timeout: 60000 }).then(() => true).catch(() => false));
  await fp.close();

  // ------------------------------------------------------------ Processing: documents, applications, deadlines
  const pp = await signIn(browser, proc.email);
  await open(pp, "/reports/consultancy-fee");
  ok("fee: Processing cannot open it", Boolean(await sentAway(pp, "/reports/consultancy-fee")) && (await pp.locator("[data-table-report]").count()) === 0, pp.url());

  // The student's own row in the results (the picker above names them whatever is shown); its
  // documents sit in a closed <details>, so its textContent, not what is drawn.
  const docsRow = async (show) => {
    await open(pp, `/reports/documents-checklist?students=${owing}&show=${show}`);
    await pp.locator("[data-showing]").waitFor({ timeout: 60000 });
    const row = pp.locator(`[data-student-row="${owing}"]`);
    return (await row.count()) ? ((await row.textContent()) ?? "") : null;
  };
  let text = await docsRow("missing");
  ok("documents: Missing lists the missing document only", Boolean(text) && text.includes(`zztmp Missing doc ${RUN}`) && !text.includes(`zztmp Rejected doc ${RUN}`) && !text.includes(`zztmp Approved doc ${RUN}`), text ?? "no row");
  text = await docsRow("rejected");
  ok("documents: Rejected lists the one sent back only", Boolean(text) && text.includes(`zztmp Rejected doc ${RUN}`) && !text.includes(`zztmp Missing doc ${RUN}`), text ?? "no row");
  text = await docsRow("complete");
  ok("documents: Completed does not list a student with documents left", text === null, text ?? "");
  const docPdf = await download(pp, `/reports/documents-checklist/download?students=${owing}&show=missing&format=pdf`);
  ok("documents: the PDF comes down", docPdf.ok && docPdf.head === "%PDF", docPdf.name);
  await open(pp, "/students");
  ok("documents: the panel is on Registered Students", await pp.locator('[data-report-panel="documents"]').waitFor({ timeout: 60000 }).then(() => true).catch(() => false));
  await open(pp, `/students/${owing}/documents`);
  ok("documents: ...and on the student's Documents tab", await pp.locator('[data-report-panel="documents"]').waitFor({ timeout: 60000 }).then(() => true).catch(() => false));

  const appsOf = async (category) => {
    await open(pp, `/reports/applications-status?student=${owing}&category=${category}`);
    await pp.locator("[data-table-report]").waitFor({ timeout: 60000 });
    return rowsOf(pp);
  };
  for (const [category, status] of [["submitted", "Submitted"], ["pending", "Pending"], ["rejected", "Rejected"], ["not_eligible", "Not eligible"]]) {
    const got = await appsOf(category);
    ok(`applications: ${status} — one, and it is that`, got.length === 1 && got[0].category === status && got[0].university === UNI, JSON.stringify(got));
  }
  const appXlsx = await download(pp, `/reports/applications-status/download?student=${owing}&format=xlsx`);
  ok("applications: the Excel file comes down", appXlsx.ok && appXlsx.head.startsWith("PK"), appXlsx.name);
  await open(pp, "/applications");
  ok("applications: the panel is on Applications", await pp.locator('[data-report-panel="applications-status"]').waitFor({ timeout: 60000 }).then(() => true).catch(() => false));
  await open(pp, `/students/${owing}/applications`);
  ok("applications: ...and on the student's Applications tab", await pp.locator('[data-report-panel="applications-status"]').waitFor({ timeout: 60000 }).then(() => true).catch(() => false));

  // Deadlines: the dependent dropdowns on Setup › Universities.
  await open(pp, "/setup/universities");
  const panel = pp.locator('[data-report-panel="university-deadlines"]');
  await panel.waitFor({ timeout: 60000 });
  await pp.waitForFunction(() => {
    const s = document.querySelector('[data-report-panel="university-deadlines"] select[name=country]');
    return Boolean(s && Object.keys(s).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 60000 });
  await panel.locator("select[name=country]").selectOption(italy.id);
  const listed = await poll(async () => ((await panel.locator(`select[name=university] option[value="${uni.id}"]`).count()) ? true : null), 30);
  ok("deadlines: choosing a country lists its universities", Boolean(listed));
  await panel.locator("select[name=university]").selectOption(uni.id);
  const progListed = await poll(async () => ((await panel.locator(`select[name=programme] option[value="${cs.id}"]`).count()) ? true : null), 30);
  ok("deadlines: ...and choosing one university lists its programmes", Boolean(progListed));

  await open(pp, `/reports/university-deadlines?country=${italy.id}&university=${uni.id}&field=cs_it`);
  await pp.locator("[data-table-report]").waitFor({ timeout: 60000 });
  rows = await rowsOf(pp);
  ok("deadlines: CS/IT — its two rounds, one open, one closing in ten days, and no Medicine",
    rows.length === 2 && rows[0].status === "Closes in 10 days" && rows[1].status === "Open" && rows.every((r) => r.programmes === "1 of 1"), JSON.stringify(rows));
  await open(pp, `/reports/university-deadlines?country=${italy.id}&university=${uni.id}&level=bachelors&programme=all`);
  await pp.locator("[data-table-report]").waitFor({ timeout: 60000 });
  rows = await rowsOf(pp);
  ok("deadlines: Bachelors, all programmes — Medicine's round, closed", rows.length === 1 && rows[0].programme === `zztmp Medicine ${RUN}` && rows[0].status === "Closed", JSON.stringify(rows));
  await open(pp, `/reports/university-deadlines?country=${italy.id}&university=${uni.id}&programme=${cs.id}`);
  await pp.locator("[data-table-report]").waitFor({ timeout: 60000 });
  rows = await rowsOf(pp);
  ok("deadlines: one programme — its rounds only", rows.length === 2 && rows.every((r) => r.programme === `zztmp Computer Science ${RUN}`), JSON.stringify(rows));
  const dlPdf = await download(pp, `/reports/university-deadlines/download?country=${italy.id}&university=${uni.id}&programme=all&format=pdf`);
  ok("deadlines: the PDF comes down, named for the university", dlPdf.ok && dlPdf.head === "%PDF" && dlPdf.name.includes(UNI), dlPdf.name);
  await open(pp, `/setup/universities/${uni.id}`);
  const uniPanel = pp.locator('[data-report-panel="university-deadlines"]');
  ok("deadlines: the university's page has the panel, set to it", await uniPanel.waitFor({ timeout: 60000 }).then(() => true).catch(() => false) &&
    (await uniPanel.locator("select[name=country]").count()) === 0 && (await uniPanel.locator(`select[name=programme] option[value="${med.id}"]`).count()) === 1);
  await pp.close();

  // ------------------------------------------------------------ Management: none of the three
  const mp = await signIn(browser, mgmt.email);
  await open(mp, "/applications");
  await mp.locator("table").first().waitFor({ timeout: 120000 }).catch(() => {});
  ok("Management: no applications report panel", (await mp.locator('[data-report-panel="applications-status"]').count()) === 0);
  await open(mp, "/reports/university-deadlines");
  ok("Management: cannot open the deadlines report", Boolean(await sentAway(mp, "/reports/university-deadlines")) && (await mp.locator("[data-table-report]").count()) === 0, mp.url());
  await open(mp, "/reports/applications-status");
  ok("Management: cannot open the applications report", Boolean(await sentAway(mp, "/reports/applications-status")) && (await mp.locator("[data-table-report]").count()) === 0, mp.url());
  await mp.close();
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (universityId) {
    await admin.from("applications").delete().eq("university_id", universityId);
    await admin.from("programs").delete().eq("university_id", universityId);
    await admin.from("universities").delete().eq("id", universityId);
  }
  if (studentIds.length) {
    const { data: invs } = await admin.from("invoices").select("id").in("student_id", studentIds);
    if (invs?.length) {
      await admin.from("invoice_installments").delete().in("invoice_id", invs.map((i) => i.id));
      await admin.from("invoices").delete().in("id", invs.map((i) => i.id));
    }
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
