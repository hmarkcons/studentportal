// Shared machinery for the scripts/verify-*.mjs suites.
//
// Those suites check things that only exist once the app, the database and RLS
// are all in play together -- who can read whose salary, whether a role change
// is refused server-side -- so they run against a deployed portal with real
// fixtures, and cannot run in CI. Everything they create is named "zztmp " and
// removed in a finally block.
//
// READ THIS BEFORE RUNNING ONE. They create auth users and staff rows in the
// live Supabase project using the service-role key from .env.local. That is why
// requireConfirmation() exists.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

export const BASE = process.env.PORTAL_URL ?? "https://studentportal-self.vercel.app";

/** The password every fixture account is given. They are deleted at the end. */
export const FIXTURE_PASSWORD = "TestQA123!@#";

/**
 * Refuses to run without an explicit opt-in.
 *
 * These write to the production database. A committed script that does that on
 * a bare `npm run` is a trap, so it takes a deliberate flag -- the same spirit
 * as verify-hook.sh refusing a dirty tree.
 */
export function requireConfirmation(name) {
  if (process.env.VERIFY_AGAINST_PRODUCTION === "yes") return;
  console.log(`${name}: refusing to run without confirmation.`);
  console.log("");
  console.log(`  This creates real staff accounts in the live Supabase project at`);
  console.log(`  ${BASE} and deletes them afterwards. It is safe, but it is not`);
  console.log("  something to start by accident.");
  console.log("");
  console.log("  To run it:");
  console.log("");
  console.log("    VERIFY_AGAINST_PRODUCTION=yes npm run " + name);
  console.log("");
  process.exit(2);
}

function readEnvLocal() {
  if (!existsSync(".env.local")) {
    throw new Error(".env.local is missing -- it holds the Supabase keys these checks need.");
  }
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

export function clients() {
  const env = readEnvLocal();
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!env[key]) throw new Error(`${key} is not set in .env.local`);
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    /** Bypasses RLS. Used only to create, inspect and remove fixtures. */
    admin: createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

/** Playwright is a --no-save scratch dependency, so say so rather than stack-trace. */
export async function openBrowser() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.log("playwright is not installed. It is deliberately not in package.json --");
    console.log("Vercel would download a browser on every build for tooling the app");
    console.log("never uses. Install it alongside the other scratch dependencies:");
    console.log("");
    console.log("  npm install --no-save playwright pg exceljs");
    console.log("");
    process.exit(2);
  }
  return await chromium.launch();
}

export function reporter() {
  let pass = 0;
  let fail = 0;
  return {
    ok(label, condition, detail = "") {
      if (condition) {
        pass += 1;
        console.log(`PASS  ${label}`);
      } else {
        fail += 1;
        console.log(`FAIL  ${label}${detail ? `  ${detail}` : ""}`);
      }
    },
    finish(removed) {
      console.log("");
      console.log(`${pass} passed, ${fail} failed  (${removed} fixture accounts removed)`);
      return fail;
    },
  };
}

/**
 * Fixture staff, tracked so they can be removed however the run ends.
 *
 * Roles are written directly rather than through the app, because these are the
 * preconditions of the checks, not the thing under test.
 */
export function fixtures(admin) {
  const made = [];
  return {
    made,
    async staff(name, roles, { pay = null, extra = {} } = {}) {
      const email = `zztmp-${name}@hmark-test.local`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: FIXTURE_PASSWORD,
        email_confirm: true,
      });
      if (error) throw new Error(`could not create ${email}: ${error.message}`);
      const id = data.user.id;
      made.push({ kind: "staff", id });

      const { error: staffError } = await admin.from("staff").insert({
        id,
        full_name: `zztmp ${name}`,
        role: roles[0],
        roles,
        status: "active",
        ...extra,
      });
      if (staffError) throw new Error(`could not insert staff ${name}: ${staffError.message}`);

      if (pay) {
        // staff_ensure_compensation (0249) already made the row; fill it in.
        const { error: payError } = await admin.from("staff_compensation").update(pay).eq("staff_id", id);
        if (payError) throw new Error(`could not set pay for ${name}: ${payError.message}`);
      }
      return { id, email, name: `zztmp ${name}` };
    },
    async lead(row) {
      const { data, error } = await admin.from("leads").insert(row).select("id").single();
      if (error) throw new Error(`could not create lead: ${error.message}`);
      made.push({ kind: "lead", id: data.id });
      return data.id;
    },
    async cleanup() {
      for (const m of [...made].reverse()) {
        if (m.kind === "lead") {
          await admin.from("leads").delete().eq("id", m.id);
        } else {
          await admin.from("staff").delete().eq("id", m.id);
          await admin.auth.admin.deleteUser(m.id).catch(() => {});
        }
      }
      return made.length;
    },
  };
}

/**
 * Signs in and lands on the dashboard.
 *
 * The goto afterwards is not redundant: the post-login redirect passes through
 * "/", where the staff layout and its nav have not rendered, and reading the
 * nav there once looked exactly like a missing permission.
 */
export async function signIn(browser, email, { context = null } = {}) {
  const page = context ? await context.newPage() : await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', FIXTURE_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  return page;
}

/** A signed-in PostgREST client, for asking what RLS lets a given person read. */
export async function apiAs(url, anonKey, email) {
  const c = createClient(url, anonKey);
  const { error } = await c.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  return c;
}

/** Opens a staff member's row menu on /admin/staff and the Edit / Roles panel. */
export async function openStaffForm(page, fullName) {
  await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const row = page.locator("tr", { hasText: fullName }).first();
  await row.locator('button[aria-label="Actions"]').click();
  await page.getByRole("button", { name: /Edit|Roles/ }).first().click();
  await page.waitForTimeout(1200);
}

/**
 * Clicks save and waits for the form to say what happened.
 *
 * Polled rather than slept: a server action's database write lands before its
 * response does, so finding the change in the database says nothing about
 * whether the page has caught up. Fixed sleeps here produced three failures
 * that were purely the harness being early.
 */
export async function saveAndSettle(page, buttonPattern = /Save changes|Save roles/) {
  await page.getByRole("button", { name: buttonPattern }).click();
  const form = page.locator("form", { hasText: "Roles (system access)" });
  for (let i = 0; i < 45; i++) {
    const text = await form.innerText();
    if (/Saved\.|Pick at least one role|Only a Super Admin|no longer exists|permission/i.test(text)) return text;
    await page.waitForTimeout(1000);
  }
  return await form.innerText();
}
