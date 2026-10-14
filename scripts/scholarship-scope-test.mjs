// Which scholarship bodies a student's application may show (src/lib/scholarshipScope.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { scholarshipScope, universityBodies } from "../src/lib/scholarshipScope.ts";

const TOSCANA = { id: "tos", name: "DSU Toscana", region: "Tuscany", covers: ["Pisa", "Florence", "Siena"] };
const ERGO = { id: "ergo", name: "ER.GO", region: "Emilia-Romagna", covers: ["Bologna", "Modena"] };
const LAZIO = { id: "laz", name: "DiSCo Lazio", region: "Lazio", covers: ["Rome (Sapienza)"] };
const ITALY = [TOSCANA, ERGO, LAZIO];
const EIFFEL = { id: "eiffel", name: "Eiffel Excellence", region: null, covers: [] };
const FRANCE = [EIFFEL, { id: "ens", name: "ENS International", region: null, covers: [] }];

const PISA = { name: "Università di Pisa", dsuBodyId: null };
const names = (list) => list.map((b) => b.name);

test("a university's own body: the one set in Setup, else the one whose covers name it", () => {
  assert.deepEqual(names(universityBodies({ name: "Università di Pisa", dsuBodyId: "ergo" }, ITALY)), ["ER.GO"], "Setup wins");
  assert.deepEqual(names(universityBodies(PISA, ITALY)), ["DSU Toscana"]);
  assert.deepEqual(universityBodies({ name: "Università di Udine" }, ITALY), [], "none linked");
  assert.deepEqual(
    names(universityBodies({ name: "Università di Pisa", dsuBodyId: "gone" }, ITALY)),
    ["DSU Toscana"],
    "a body no longer the country's falls back to covers",
  );
});

test("before the university is finalised, nothing of Italy's twenty-odd bodies shows", () => {
  const s = scholarshipScope({ access: "universal", finalized: false, university: PISA, countryBodies: ITALY, recorded: [] });
  assert.deepEqual(s.shown, []);
  assert.equal(s.needsChoice, false);
});

test("finalised, only that university's body — no other region", () => {
  const s = scholarshipScope({ access: "universal", finalized: true, university: PISA, countryBodies: ITALY, recorded: [] });
  assert.deepEqual(names(s.shown), ["DSU Toscana"]);
  assert.deepEqual(names(s.own), ["DSU Toscana"]);
});

test("finalised with no body linked: nothing shows, and staff are asked to choose", () => {
  const s = scholarshipScope({ access: "universal", finalized: true, university: { name: "Università di Udine" }, countryBodies: ITALY, recorded: [] });
  assert.deepEqual(s.shown, []);
  assert.equal(s.needsChoice, true);
  const chosen = scholarshipScope({
    access: "universal",
    finalized: true,
    university: { name: "Università di Udine" },
    countryBodies: ITALY,
    recorded: [LAZIO],
  });
  assert.deepEqual(names(chosen.shown), ["DiSCo Lazio"], "once chosen it is recorded, and shows");
  assert.equal(chosen.needsChoice, false);
});

test("a body recorded for the student always shows, beside its own and once", () => {
  const s = scholarshipScope({ access: "universal", finalized: true, university: PISA, countryBodies: ITALY, recorded: [TOSCANA, ERGO] });
  assert.deepEqual(names(s.shown), ["DSU Toscana", "ER.GO"]);
});

test("merit-based: only what the student is put forward for, finalised or not", () => {
  const none = scholarshipScope({ access: "merit", finalized: true, university: { name: "Université Paris Cité" }, countryBodies: FRANCE, recorded: [] });
  assert.deepEqual(none.shown, []);
  assert.equal(none.needsChoice, false, "a merit country has no body to choose for a university");
  const put = scholarshipScope({ access: "merit", finalized: false, university: { name: "Université Paris Cité" }, countryBodies: FRANCE, recorded: [EIFFEL] });
  assert.deepEqual(names(put.shown), ["Eiffel Excellence"]);
});
