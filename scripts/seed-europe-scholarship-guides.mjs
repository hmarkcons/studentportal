// The scholarship guides for the European destinations other than Italy —
// France, Germany, Hungary, Romania, Spain, Austria, Luxembourg, Sweden,
// Finland — and Erasmus Mundus, which serves all of them.
//
// Same shape and same reasoning as seed-scholarship-guides.mjs: this is content,
// not schema, so it lives in a re-runnable script rather than a migration. The
// guides are edited in the app from the day they land, and a migration that
// rewrote them would undo whoever had corrected one. Run it again only to
// re-seed a body that has not been touched, or a fresh database.
//
// The data sits beside this file in europe-scholarship-guides.json rather than
// inline, because the same file is read by the PowerShell applier used on a
// machine without Node (scripts/apply-europe-scholarship-guides.ps1). One file,
// two runners, no drift.
//
// Matched to bodies by name (or any of the `match` aliases). A body that does
// not exist yet is created and linked to every destination whose country is in
// its `countries` list. Anything already on an existing row and not named in
// the data — call_pdf_path, guide_updated_by, last_checked_at — is left as is.
//
//   node scripts/seed-europe-scholarship-guides.mjs          # what it would change
//   node scripts/seed-europe-scholarship-guides.mjs --apply  # change it

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"\r?$/g, "").trim()];
    })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const here = dirname(fileURLToPath(import.meta.url));
const GUIDES = JSON.parse(readFileSync(join(here, "europe-scholarship-guides.json"), "utf8"));

// The columns the data file may set. Anything else in a record is ignored, so a
// stray key in the JSON cannot reach the database.
const COLUMNS = [
  "region",
  "covers",
  "academic_year",
  "application_deadline",
  "call_status",
  "call_expected_on",
  "call_notes",
  "source_url",
  "apply_url",
  "call_page_url",
  "call_pdf_url",
  "stipend_amount",
  "benefits",
];

const [{ data: bodies, error: bodiesErr }, { data: destinations, error: destErr }] = await Promise.all([
  db.from("scholarship_bodies").select("id, name, guide_sections"),
  db.from("destinations").select("id, country"),
]);
if (bodiesErr || destErr) {
  console.error(bodiesErr ?? destErr);
  process.exit(1);
}

const byCountry = new Map();
for (const d of destinations) {
  const k = d.country.trim().toLowerCase();
  byCountry.set(k, [...(byCountry.get(k) ?? []), d.id]);
}

function patchFor(g) {
  const patch = { guide_sections: g.sections, guide_updated_at: new Date().toISOString() };
  for (const c of COLUMNS) if (g[c] !== undefined) patch[c] = g[c];
  // A published call has no "expected on" — the form clears it the same way.
  if (patch.call_status === "published") patch.call_expected_on = null;
  return patch;
}

let updated = 0;
let created = 0;
const problems = [];

for (const g of GUIDES) {
  const names = [g.name, ...(g.match ?? [])].map((n) => n.toLowerCase());
  const body = bodies.find((b) => names.includes(b.name.toLowerCase()));

  const destIds = [...new Set((g.countries ?? []).flatMap((c) => byCountry.get(c.trim().toLowerCase()) ?? []))];
  if (destIds.length === 0) {
    problems.push(`${g.name}: none of ${JSON.stringify(g.countries)} is a destination — skipped`);
    continue;
  }

  const verb = body ? "update" : "create";
  const already = body && Array.isArray(body.guide_sections) ? body.guide_sections.length : 0;
  console.log(
    `${APPLY ? verb.padEnd(7) : `would ${verb}`.padEnd(13)} ${g.name.padEnd(64)} ${g.sections.length} sections${already ? ` (replacing ${already})` : ""}  → ${(g.countries ?? []).join(", ")}`
  );
  if (!APPLY) continue;

  if (body) {
    // Matched through an alias: the data file is renaming the body. The old
    // name stays in `match` so the next run still finds it either way.
    const patch = patchFor(g);
    if (body.name.toLowerCase() !== g.name.toLowerCase()) patch.name = g.name;
    const { error } = await db.from("scholarship_bodies").update(patch).eq("id", body.id);
    if (error) {
      problems.push(`${g.name}: ${error.message}`);
      continue;
    }
    // Countries are added, never removed: a link somebody made by hand in the
    // app is a decision this script has no business undoing.
    const { error: linkErr } = await db
      .from("scholarship_body_destinations")
      .upsert(
        destIds.map((destination_id) => ({ scholarship_body_id: body.id, destination_id })),
        { onConflict: "scholarship_body_id,destination_id", ignoreDuplicates: true }
      );
    if (linkErr) problems.push(`${g.name} (links): ${linkErr.message}`);
    updated++;
  } else {
    const { data: row, error } = await db
      .from("scholarship_bodies")
      .insert({ name: g.name, ...patchFor(g), last_updated_year: new Date().getFullYear() })
      .select("id")
      .single();
    if (error) {
      problems.push(`${g.name}: ${error.message}`);
      continue;
    }
    const { error: linkErr } = await db
      .from("scholarship_body_destinations")
      .insert(destIds.map((destination_id) => ({ scholarship_body_id: row.id, destination_id })));
    if (linkErr) {
      // Same rule as createScholarshipBody: a body with no country is invisible
      // everywhere, so it is not left behind half-made.
      await db.from("scholarship_bodies").delete().eq("id", row.id);
      problems.push(`${g.name} (links): ${linkErr.message}`);
      continue;
    }
    created++;
  }
}

console.log(`\n${GUIDES.length} guides in the file.`);
if (APPLY) console.log(`${updated} updated, ${created} created.`);
if (problems.length) {
  console.log("\nProblems:");
  for (const p of problems) console.log("  " + p);
  process.exitCode = 1;
}
if (!APPLY) console.log("\nDry run. Re-run with --apply to write.");
