// Brings every registered student's stages up to date with their record, once.
//
//   node scripts/backfill-auto-stages.mjs            # dry run: reports, writes nothing
//   node scripts/backfill-auto-stages.mjs --apply    # writes what the dry run reported
//   ... --student HMC-SEP27-IT-0007                  # one student, by Student ID
//
// Stages move themselves forward when something happens — a document
// approved, a letter filed, the visa tracker saved (src/lib/autoStagesSync.ts).
// A student whose developments all came before that existed has nothing to set
// it off, so their status bars stay where somebody last left them until the
// next thing happens. This runs the same plan for each of them now.
//
// The plan is the app's own (src/lib/autoStagesLoad.ts, imported rather than
// copied), and like the app it only moves forward: a stage already set is
// never changed, an application is moved only if it still sits where the plan
// found it. Run the dry run first and read it; --apply writes to production.
import { clients } from "./verify-portal-lib.mjs";
import { planStudentStages, writeStagePlan } from "../src/lib/autoStagesLoad.ts";

const apply = process.argv.includes("--apply");
const only = process.argv.includes("--student") ? process.argv[process.argv.indexOf("--student") + 1] : null;
if (process.argv.includes("--student") && !only) throw new Error("--student needs a Student ID");
const { admin } = clients();

/** Every registered student, a page at a time: PostgREST returns 1000 rows at most. */
async function registeredStudents() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("leads")
      .select("id, full_name, student_code")
      .not("registered_at", "is", null)
      .not("full_name", "ilike", "zztmp%")
      .order("registered_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`could not list students: ${error.message}`);
    all.push(...data);
    if (data.length < 1000) return all;
  }
}

const students = (await registeredStudents()).filter((s) => !only || s.student_code === only);
if (only && students.length === 0) throw new Error(`no registered student with the Student ID ${only}`);
console.log(`${apply ? "APPLYING" : "Dry run"} — ${students.length} registered students\n`);

const countryStages = new Map();
const applicationMoves = new Map();
const touched = [];
let failed = 0;
let written = { countries: 0, applications: 0 };

for (const s of students) {
  let plan;
  try {
    plan = await planStudentStages(admin, s.id);
  } catch (e) {
    failed += 1;
    console.log(`  could not plan ${s.student_code ?? s.id}: ${e instanceof Error ? e.message : e}`);
    continue;
  }
  if (plan.countries.length === 0 && plan.applications.length === 0) continue;
  touched.push({ s, plan });
  for (const c of plan.countries) for (const key of c.set) countryStages.set(key, (countryStages.get(key) ?? 0) + 1);
  for (const a of plan.applications) {
    const move = `${a.from ?? "(none)"} → ${a.to}`;
    applicationMoves.set(move, (applicationMoves.get(move) ?? 0) + 1);
  }
  if (apply) {
    const done = await writeStagePlan(admin, s.id, plan);
    written = { countries: written.countries + done.countries, applications: written.applications + done.applications };
  }
}

const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
console.log(`${touched.length} of ${students.length} students have something to move${failed ? ` (${failed} could not be planned)` : ""}.\n`);
console.log("Country status-bar stages that would be set (stage — students):");
for (const [key, n] of sorted(countryStages)) console.log(`  ${key.padEnd(24)} ${n}`);
if (countryStages.size === 0) console.log("  none");
console.log("\nApplication stages that would move (from → to — applications):");
for (const [move, n] of sorted(applicationMoves)) console.log(`  ${move.padEnd(48)} ${n}`);
if (applicationMoves.size === 0) console.log("  none");
console.log("\nStudents, first 25:");
for (const { s, plan } of touched.slice(0, 25)) {
  const parts = [
    ...plan.countries.map((c) => `${c.set.join(", ")}`),
    ...plan.applications.map((a) => `application ${a.from ?? "(none)"} → ${a.to}`),
  ];
  console.log(`  ${(s.student_code ?? "(no ID)").padEnd(20)} ${parts.join("; ")}`);
}
if (apply) console.log(`\nWrote ${written.countries} country bars and ${written.applications} application stages.`);
else console.log("\nNothing was written. Run again with --apply to write this.");
