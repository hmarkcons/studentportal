// Adds the sample staff agreement template, if it is not there already.
//
//   node scripts/seed-staff-agreement-sample.mjs
//   node scripts/seed-staff-agreement-sample.mjs --replace   (after changing the sample's wording here)
//
// The sample is what a Super Admin duplicates to start a new staff template
// (see the guide on Setup → Agreement templates → Staff). Its wording lives in
// scripts/samples/staff-employment-agreement.html, so it can always be put
// back exactly as it was — whatever is later edited or deleted in the portal.
//
// Idempotent: a template already carrying the sample's name is left alone,
// never overwritten, because someone may have edited it on purpose.
//
// --replace updates the sample's wording to this file's — but only while the
// wording in the portal is still the version last committed here, i.e.
// nobody has edited it there. An edited sample is refused, and left exactly
// as it is. (Not judged by timestamps: this script's own update moves
// updated_at, and would then look like somebody's edit.)
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { clients } from "./verify-portal-lib.mjs";

const NAME = "Sample — Employment Agreement";
const SIGNATORY = "Muhammad Abdul Hadi";

const { admin } = clients();
// Line endings normalised: a Windows checkout turns this file's \n into \r\n,
// and the wording would then never match what is stored.
const wording = readFileSync(new URL("./samples/staff-employment-agreement.html", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n")
  .trim();

// No process.exit(): on Windows, exiting while the HTTP client's sockets are
// still closing trips a libuv assertion. The script just runs to its end.
async function main() {
  const { data: existing } = await admin
    .from("staff_agreement_templates")
    .select("id, wording, created_at, updated_at")
    .eq("name", NAME)
    .maybeSingle();
  if (existing && !process.argv.includes("--replace")) {
    console.log(`"${NAME}" is already there (${existing.id}) — left as it is.`);
    return;
  }
  if (existing) {
    if (existing.wording.trim() === wording) {
      console.log(`"${NAME}" already has this wording — nothing to change.`);
      return;
    }
    let committed = "";
    try {
      committed = execFileSync("git", ["show", "HEAD:scripts/samples/staff-employment-agreement.html"], { encoding: "utf8" })
        .replace(/\r\n/g, "\n")
        .trim();
    } catch {
      // Never committed: there is no earlier version to have been left untouched.
    }
    if (existing.wording.trim() !== committed) {
      console.error(`"${NAME}" has been edited in the portal (last on ${existing.updated_at}) — not replaced. Rename or delete it there first.`);
      process.exitCode = 1;
      return;
    }
    const { error } = await admin.from("staff_agreement_templates").update({ wording }).eq("id", existing.id);
    if (error) {
      console.error(`Could not update the sample: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Updated "${NAME}" (${existing.id}) to this file's wording.`);
    return;
  }

  // Attributed to the signatory's own staff record when there is one.
  const { data: signer } = await admin.from("staff").select("id").eq("full_name", SIGNATORY).maybeSingle();
  const { data, error } = await admin
    .from("staff_agreement_templates")
    .insert({ name: NAME, signatory_name: SIGNATORY, wording, created_by: signer?.id ?? null })
    .select("id")
    .single();
  if (error) {
    console.error(`Could not add the sample: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Added "${NAME}" (${data.id}).`);
}

await main();
