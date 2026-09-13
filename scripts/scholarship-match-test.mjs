import test from "node:test";
import assert from "node:assert/strict";
import { bodiesForUniversity, bodyMatch, coverTerms } from "../src/lib/scholarshipMatch.ts";

// The directory as it actually stands in production.
const BODIES = [
  { id: "umbria", name: "ADISU Umbria", covers: ["Perugia"] },
  { id: "campania", name: "ADiSURC", covers: ["Naples / Campania"] },
  { id: "aquila", name: "ADSU L'Aquila", covers: ["L'Aquila"] },
  { id: "liguria", name: "ALiSEO Liguria", covers: ["Genoa"] },
  { id: "fvg", name: "ARDiS FVG", covers: ["Trieste", "Udine"] },
  { id: "lazio", name: "DiSCo Lazio", covers: ["Rome (Sapienza)"] },
  { id: "toscana", name: "DSU Toscana", covers: ["Florence", "Pisa", "Siena"] },
  { id: "pavia", name: "EDiSU Pavia", covers: ["Pavia"] },
  { id: "piemonte", name: "EDISU Piemonte", covers: ["Turin", "Politecnico di Torino"] },
  { id: "ergo", name: "ER.GO", covers: ["Bologna", "Parma", "Modena", "Reggio Emilia", "Ferrara"] },
  { id: "marche", name: "ERDIS Marche", covers: ["Ancona (Politecnica delle Marche)", "Camerino", "Macerata", "Urbino"] },
  { id: "catania", name: "ERSU Catania", covers: ["Catania"] },
  { id: "messina", name: "ERSU Messina", covers: ["Messina"] },
  { id: "padova", name: "ESU Padova", covers: ["Padua"] },
  { id: "venezia", name: "ESU Venezia", covers: ["Venice (Ca'Foscari, IUAV)"] },
  { id: "verona", name: "ESU Verona", covers: ["Verona"] },
  { id: "polimi", name: "Politecnico di Milano", covers: ["Milan"] },
  { id: "bergamo", name: "Università degli Studi di Bergamo", covers: ["Bergamo"] },
  { id: "brescia", name: "Università degli Studi di Brescia", covers: ["Brescia"] },
  { id: "statale", name: "Università degli Studi di Milano (Statale)", covers: ["Milan"] },
  { id: "bicocca", name: "Università degli Studi di Milano-Bicocca", covers: ["Milan"] },
];

// Every Italian university on file, and the body that actually pays for it.
const EXPECTED = {
  "Alma Mater Studiorum – Università di Bologna": "ergo",
  "Politecnico di Milano": "polimi",
  "Politecnico di Torino": "piemonte",
  "Sapienza Università di Roma": "lazio",
  "Università Ca' Foscari Venezia": "venezia",
  "Università degli Studi dell'Aquila": "aquila",
  "Università degli Studi della Campania": "campania",
  "Università degli Studi di Bergamo": "bergamo",
  "Università degli Studi di Brescia": "brescia",
  "Università degli Studi di Catania": "catania",
  "Università degli Studi di Ferrara": "ergo",
  "Università degli Studi di Firenze": "toscana",
  "Università degli Studi di Genova": "liguria",
  "Università degli Studi di Messina": "messina",
  "Università degli Studi di Milano (Statale)": "statale",
  "Università degli Studi di Milano-Bicocca": "bicocca",
  "Università degli Studi di Modena e Reggio Emilia": "ergo",
  "Università degli Studi di Padova": "padova",
  "Università degli Studi di Perugia": "umbria",
  "Università degli Studi di Siena": "toscana",
  "Università degli Studi di Trieste": "fvg",
  "Università degli Studi di Udine": "fvg",
  "Università degli Studi di Verona": "verona",
  "Università di Parma": "ergo",
  "Università di Pavia": "pavia",
  "Università di Pisa": "toscana",
  "Università Iuav di Venezia": "venezia",
  "Università Politecnica delle Marche": "marche",
};

test("every university on file resolves to exactly one body, and the right one", () => {
  for (const [university, expected] of Object.entries(EXPECTED)) {
    const found = bodiesForUniversity(university, BODIES);
    assert.equal(found.length, 1, `${university} → ${found.map((b) => b.id).join(", ") || "nothing"}`);
    assert.equal(found[0].id, expected, university);
  }
});

test("a university that runs its own scholarships gets its own body, not its city's", () => {
  // Three bodies cover "Milan". Offering all three against Politecnico di
  // Milano would be the noise this replaces.
  assert.deepEqual(bodiesForUniversity("Politecnico di Milano", BODIES).map((b) => b.id), ["polimi"]);
  assert.equal(bodyMatch("Politecnico di Milano", BODIES.find((b) => b.id === "polimi")), "own");
  assert.equal(bodyMatch("Politecnico di Milano", BODIES.find((b) => b.id === "statale")), "covers");
});

test("English city names find their Italian universities", () => {
  // The half of the directory that the old exact match could never reach.
  for (const [university, expected] of [
    ["Università degli Studi di Firenze", "toscana"], // Florence
    ["Università degli Studi di Genova", "liguria"], // Genoa
    ["Università degli Studi di Padova", "padova"], // Padua
    ["Sapienza Università di Roma", "lazio"], // Rome
    ["Politecnico di Torino", "piemonte"], // Turin
  ]) {
    assert.equal(bodiesForUniversity(university, BODIES)[0]?.id, expected, university);
  }
});

test("a bracketed note names things worth matching", () => {
  assert.deepEqual(coverTerms("Venice (Ca'Foscari, IUAV)"), ["Ca'Foscari", "IUAV", "Venice"]);
  assert.deepEqual(coverTerms("Ancona (Politecnica delle Marche)"), ["Politecnica delle Marche", "Ancona"]);
  assert.deepEqual(coverTerms("Naples / Campania"), ["Naples", "Campania"]);
  assert.deepEqual(coverTerms("Perugia"), ["Perugia"]);
});

test("apostrophes and accents do not decide the match", () => {
  assert.equal(bodiesForUniversity("Università degli Studi dell'Aquila", BODIES)[0]?.id, "aquila");
  assert.equal(bodiesForUniversity("Universita degli Studi dell Aquila", BODIES)[0]?.id, "aquila");
  assert.equal(bodiesForUniversity("Università Ca' Foscari Venezia", BODIES)[0]?.id, "venezia");
});

test("a university nobody covers matches nothing rather than guessing", () => {
  assert.deepEqual(bodiesForUniversity("University of Helsinki", BODIES), []);
  assert.deepEqual(bodiesForUniversity("", BODIES), []);
  assert.deepEqual(bodiesForUniversity(null, BODIES), []);
});

test("a short term cannot match on a fragment", () => {
  // "Bari" inside "Barinelli" is the kind of thing that makes a matcher worse
  // than no matcher, so anything under four characters is not a substring.
  const shortBody = [{ id: "x", name: "X", covers: ["Bar"] }];
  assert.deepEqual(bodiesForUniversity("Università di Barcellona", shortBody), []);
});

test("a body with no covers and an unrelated name matches nothing", () => {
  const bare = [{ id: "bare", name: "Regional Agency", covers: [] }];
  assert.deepEqual(bodiesForUniversity("Università di Pisa", bare), []);
  const nullCovers = [{ id: "n", name: "Regional Agency", covers: null }];
  assert.deepEqual(bodiesForUniversity("Università di Pisa", nullCovers), []);
});
