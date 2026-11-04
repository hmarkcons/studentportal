// Every staff page of the deployed portal, in the three browser engines people
// use: Chromium (Chrome, Edge — Windows and Mac), WebKit (Safari on a Mac,
// every browser on an iPhone) and Firefox.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:browsers
//   ENGINES=webkit npm run check:browsers      # one engine
//   SHOT_DIR=<folder>                          # a screenshot of each page
//
// Needs the engines: npx playwright install chromium webkit firefox.
//
// Signed in as a fixture Super Admin (who may open every page), at a MacBook's
// window size, it opens every page under src/app/(staff) — found from the
// folders, so a new page is checked without anyone adding it here — and, for
// the pages of one record, a real registered student and a real lead. Then,
// signed in as a fixture registered student, every page of the student
// portal, src/app/(student). On each
// it fails on: an uncaught script error, a console error, a server error on
// the page or its data, or Next's error screen in place of the page. Then it
// clicks the two reports' downloads, which hand a file to the browser in a
// way Safari treats differently. Read-only on the real records; its fixture
// is removed in a finally.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BASE, clients, fixtures, FIXTURE_PASSWORD, reporter, requireConfirmation } from "./verify-portal-lib.mjs";

requireConfirmation("check:browsers");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const ENGINES = (process.env.ENGINES ?? "chromium,webkit,firefox").split(",").map((e) => e.trim()).filter(Boolean);

// ---------------------------------------------------------------- the pages
function pagesUnder(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) {
      if (name === "page.tsx") out.push(prefix || "/");
      continue;
    }
    if (name.startsWith("(") || name.startsWith("_") || name.startsWith("@")) out.push(...pagesUnder(full, prefix));
    else out.push(...pagesUnder(full, `${prefix}/${name}`));
  }
  return out;
}

const { data: student } = await admin.from("students").select("id").eq("registration_status", "registered").not("student_code", "is", null).order("registered_at", { ascending: false }).limit(1).maybeSingle();
const { data: lead } = await admin.from("leads").select("id").is("registered_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
const { data: app } = student ? await admin.from("applications").select("id").eq("student_id", student.id).limit(1).maybeSingle() : { data: null };

const fill = (route) =>
  route
    .replace("/students/[id]/applications/[appId]", app ? `/students/${student?.id}/applications/${app.id}` : "/students/[id]/applications/[appId]")
    .replace("/students/[id]", student ? `/students/${student.id}` : "/students/[id]")
    .replace("/leads/[id]", lead ? `/leads/${lead.id}` : "/leads/[id]");

const staffRoutes = pagesUnder("src/app/(staff)")
  .map(fill)
  // Pages of a record of another kind need its id; the record pages that matter most are filled above.
  .filter((r) => !r.includes("["))
  .sort();
const routes = ["/login", "/terms", "/privacy", ...staffRoutes];
const studentRoutes = pagesUnder("src/app/(student)").filter((r) => !r.includes("[")).sort();
const STUDENT_EMAIL = "zztmp-xbrowser-student@hmark-test.local";
const karachiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

/**
 * Signs in on /login, once React has the form: a form submitted from the
 * server's HTML before hydration goes nowhere, and a slower engine is slower
 * to hydrate (verify-student-dashboard learnt it first).
 */
async function signInAs(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page
    .waitForFunction(() => {
      const el = document.querySelector('input[name="email"]');
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__react")));
    }, null, { timeout: 60000 })
    .catch(() => {});
  await page.fill('input[name="email"]', email);
  await page.fill('input[type="password"]', FIXTURE_PASSWORD);
  await page.click('button[type="submit"]');
  const left = await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 }).then(() => true, () => false);
  // Signing in lands on "/" and is sent on to the Dashboard or the portal: wait
  // for that, or the first page opened is cut short by it.
  if (left) await page.waitForURL((u) => /^\/(dashboard|portal)/.test(u.pathname), { timeout: 30000 }).catch(() => {});
  if (left) await page.waitForLoadState("load").catch(() => {});
  return left;
}

/** Opens each route, and notes what went wrong on it. */
async function sweep(page, name, list, problems, setCurrent) {
  let opened = 0;
  for (const route of list) {
    setCurrent(route);
    const t0 = Date.now();
    const res = await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 60000 }).catch((e) => {
      problems.push({ route, kind: "did not load", text: String(e.message).split("\n")[0] });
      return null;
    });
    if (!res) continue;
    // Streamed sections and hydration: give the page a moment to finish.
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => ({
      errorScreen: /Application error|This page couldn.t load|Unhandled Runtime Error|Something went wrong/i.test(document.body.innerText),
      text: document.body.innerText.trim().length,
    }));
    if (state.errorScreen) problems.push({ route, kind: "error screen", text: "Next's error screen in place of the page" });
    if (state.text < 40) problems.push({ route, kind: "blank", text: `${state.text} characters of text` });
    if (res.status() >= 500) problems.push({ route, kind: `HTTP ${res.status()}`, text: "the page itself" });
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}${route.replace(/[^\w]+/g, "_")}.png` }).catch(() => {});
    opened++;
    if (Date.now() - t0 > 20000) console.log(`      ${name} ${route}: slow, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  return opened;
}

function watch(page, problems, getCurrent) {
  page.on("pageerror", (e) => {
    const text = String(e.message ?? e);
    if (!isNoise(text)) problems.push({ route: getCurrent(), kind: "script error", text: text.slice(0, 300) });
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (!isNoise(text)) problems.push({ route: getCurrent(), kind: "console error", text: text.slice(0, 300) });
  });
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().startsWith(BASE)) problems.push({ route: getCurrent(), kind: `HTTP ${r.status()}`, text: r.url().replace(BASE, "") });
  });
}

function report(name, who, problems) {
  const byRoute = new Map();
  for (const p of problems) byRoute.set(p.route, [...(byRoute.get(p.route) ?? []), p]);
  for (const [route, list] of byRoute) {
    for (const p of list.slice(0, 4)) console.log(`      ${name} ${route}  ${p.kind}: ${p.text}`);
    if (list.length > 4) console.log(`      ${name} ${route}  …and ${list.length - 4} more`);
  }
  ok(`${name} (${who}): no script errors, console errors, server errors or error screens`, problems.length === 0, `${problems.length} on ${byRoute.size} pages`);
}

// ---------------------------------------------------------------- what counts as broken
const NOISE = [
  /favicon/i,
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  // A request the page cancelled by moving on (prefetch, a superseded fetch).
  /net::ERR_ABORTED|NS_BINDING_ABORTED|cancelled|Load failed$/i,
  // Third-party embeds the portal does not own.
  /googletagmanager|google-analytics|facebook|tiktok|doubleclick/i,
  // Firefox refusing Cloudflare's bot cookie on Supabase's image responses: theirs, harmless.
  /Cookie “?__cf_bm”? has been rejected/i,
  // Firefox's word for a request cut short by moving to the next page. A request
  // that really fails still shows, as the server error the response listener records.
  /^NetworkError when attempting to fetch resource\.?$/,
];
// WebKit's word for one of the portal's own requests cut short by moving to
// the next page (a prefetch, the notifications poll): "…/dashboard?_rsc=… due
// to access control checks". The portal catches them; WebKit reports them
// anyway, always naming the page being left. A real cross-origin refusal
// names another host, and still counts.
const ownHost = new URL(BASE).host.replace(/\./g, "\\.");
NOISE.push(new RegExp(`${ownHost}/[^ ]* due to access control checks`));
const isNoise = (text) => NOISE.some((re) => re.test(text));

async function openEngine(name) {
  const pw = await import("playwright");
  const engine = pw[name];
  try {
    return await engine.launch();
  } catch (e) {
    console.log(`      ${name} is not installed — npx playwright install ${name}  (${String(e.message).split("\n")[0]})`);
    return null;
  }
}

let fixtureEmail = null;
let studentReady = false;
let studentId = null;
let studentUserId = null;
try {
  const adminUser = await fx.staff("xbrowser", ["super_admin"]);
  fixtureEmail = adminUser.email;

  // A registered student with a portal login, as verify-student-dashboard makes one.
  const { data: leftovers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of leftovers?.users ?? []) if (u.email === STUDENT_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  studentId = await fx.lead({
    full_name: "zztmp Browser Student", email: "zztmp-xbrowser@example.invalid", contact_number: "0300-9999994",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: karachiToday(), country_of_interest: "Italy (Public)", intake: "Fall 2099", level_applying_for: "masters",
  });
  await admin.from("lead_destinations").insert([{ lead_id: studentId, destination_id: italy.id, is_backup: false, dashboard_stage_values: {} }]);
  for (let i = 0; i < 20 && !studentReady; i++) {
    const { data } = await admin.from("leads").select("portal_active, student_code").eq("id", studentId).single();
    studentReady = Boolean(data?.portal_active && data.student_code);
    if (!studentReady) await new Promise((r) => setTimeout(r, 1000));
  }
  if (studentReady) {
    const { data: made } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
    studentUserId = made?.user?.id ?? null;
    await admin.from("leads").update({ auth_user_id: studentUserId }).eq("id", studentId);
    studentReady = Boolean(studentUserId);
  }
  ok("a fixture student with a portal login", studentReady);
  console.log(`      ${studentRoutes.length} student portal pages`);
  console.log(`      ${routes.length} pages: ${routes.length - 3} staff pages and the 3 public ones; student ${student?.id ? "found" : "missing"}, lead ${lead?.id ? "found" : "missing"}`);

  for (const name of ENGINES) {
    const browser = await openEngine(name);
    if (!browser) {
      ok(`${name}: engine available`, false);
      continue;
    }
    // A MacBook Pro's window: 1440 wide, drawn at 2x.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: name === "webkit" ? 2 : 1, acceptDownloads: true });
    const page = await context.newPage();

    const problems = [];
    let current = "/login";
    watch(page, problems, () => current);

    const signedIn = await signInAs(page, fixtureEmail);
    ok(`${name}: staff sign in`, signedIn, page.url());
    if (signedIn) {
      const staffPages = routes.filter((r) => r !== "/login");
      const opened = await sweep(page, name, staffPages, problems, (r) => (current = r));
      ok(`${name}: every staff page opened`, opened === staffPages.length, `${opened} of ${staffPages.length}`);

      // The reports' downloads: fetched, then handed to the browser as a file.
      for (const [route, label] of [
        ["/reports/documents-checklist?students=" + (student?.id ?? ""), "documents checklist"],
        ["/reports/applications-logins?students=" + (student?.id ?? ""), "applications & portal logins"],
      ]) {
        current = route;
        await page.goto(`${BASE}${route}`, { waitUntil: "load" });
        for (const format of ["pdf", "xlsx"]) {
          const button = page.locator(`button[data-download="${format}"]`).first();
          const got = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), button.click()])
            .then(([d]) => d.suggestedFilename())
            .catch((e) => `none (${String(e.message).split("\n")[0]})`);
          ok(`${name}: ${label} ${format.toUpperCase()} downloads`, got.endsWith(`.${format}`), got);
        }
      }
    }
    report(name, "staff", problems);

    // The student portal, in a context of its own.
    if (studentReady) {
      const sContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: name === "webkit" ? 2 : 1 });
      const sPage = await sContext.newPage();
      const sProblems = [];
      let sCurrent = "/login";
      watch(sPage, sProblems, () => sCurrent);
      const sIn = await signInAs(sPage, STUDENT_EMAIL);
      ok(`${name}: student sign in`, sIn, sPage.url());
      if (sIn) {
        const opened = await sweep(sPage, `${name}-student`, studentRoutes, sProblems, (r) => (sCurrent = r));
        ok(`${name}: every student page opened`, opened === studentRoutes.length, `${opened} of ${studentRoutes.length}`);
      }
      report(name, "student", sProblems);
      await sContext.close();
    }
    await browser.close();
  }
} catch (e) {
  ok("the check ran to the end", false, e?.stack ?? String(e));
} finally {
  if (studentId) {
    await admin.from("student_documents").delete().eq("student_id", studentId);
    await admin.from("student_cycles").delete().eq("student_id", studentId);
  }
  const removed = await fx.cleanup();
  // After the lead: leads.auth_user_id references this login until it goes.
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  process.exitCode = finish(removed) ? 1 : 0;
}
