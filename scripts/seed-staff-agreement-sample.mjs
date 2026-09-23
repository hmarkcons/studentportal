// Adds the sample staff agreement template, if it is not there already.
//
//   node scripts/seed-staff-agreement-sample.mjs
//
// The sample is what a Super Admin duplicates to start a new staff template
// (see the guide on Setup → Agreement templates → Staff). Its wording lives in
// scripts/samples/staff-employment-agreement.html, so it can always be put
// back exactly as it was — whatever is later edited or deleted in the portal.
//
// Idempotent: a template already carrying the sample's name is left alone,
// never overwritten, because someone may have edited it on purpose.
import { readFileSync } from "node:fs";
import { clients } from "./verify-portal-lib.mjs";

const NAME = "Sample — Employment Agreement";
const SIGNATORY = "Muhammad Abdul Hadi";

const { admin } = clients();
const wording = readFileSync(new URL("./samples/staff-employment-agreement.html", import.meta.url), "utf8").trim();

// No process.exit(): on Windows, exiting while the HTTP client's sockets are
// still closing trips a libuv assertion. The script just runs to its end.
async function main() {
  const { data: existing } = await admin.from("staff_agreement_templates").select("id").eq("name", NAME).maybeSingle();
  if (existing) {
    console.log(`"${NAME}" is already there (${existing.id}) — left as it is.`);
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
