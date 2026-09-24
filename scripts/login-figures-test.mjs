import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_LOGIN_FIGURES, LOGIN_FIGURE_ICONS, MAX_LOGIN_FIGURES, parseLoginFigures } from "../src/lib/loginFigures.ts";

const form = (fields) => (name) => fields[name];

test("figures are read in order, and an empty row is how one is removed", () => {
  const got = parseLoginFigures(
    form({ value_0: " 15 ", label_0: "Years Experience", icon_0: "years", value_1: "", label_1: "", value_2: "97%", label_2: "Visa Success", icon_2: "visa" })
  );
  assert.deepEqual(got, {
    figures: [
      { value: "15", label: "Years Experience", icon: "years" },
      { value: "97%", label: "Visa Success", icon: "visa" },
    ],
  });
});

test("a half-filled row is an error, not a silent drop", () => {
  assert.match(parseLoginFigures(form({ value_0: "15" })).error, /number but no label/);
  assert.match(parseLoginFigures(form({ label_0: "Years" })).error, /label but no number/);
});

test("an unknown icon falls back to the star", () => {
  assert.equal(parseLoginFigures(form({ value_0: "1", label_0: "x", icon_0: "<script>" })).figures[0].icon, "star");
});

test("lengths, and how many fit, are held to what the screen can show", () => {
  assert.match(parseLoginFigures(form({ value_0: "1234567890123", label_0: "x" })).error, /too long/);
  assert.match(parseLoginFigures(form({ value_0: "1", label_0: "x".repeat(41) })).error, /too long/);
  const seven = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [[`value_${i}`, `${i}`], [`label_${i}`, "L"]]).flat());
  assert.match(parseLoginFigures(form(seven)).error, new RegExp(`Up to ${MAX_LOGIN_FIGURES}`));
  assert.match(parseLoginFigures(form({})).error, /at least one/);
});

test("the fallback figures are the ones the migration seeds", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0278_login_figures.sql", import.meta.url), "utf8");
  const seeded = [...sql.matchAll(/\(\d, '([^']+)', '([^']+)', '([a-z]+)'\)/g)].map(([, value, label, icon]) => ({ value, label, icon }));
  assert.deepEqual(seeded, DEFAULT_LOGIN_FIGURES);
  for (const f of DEFAULT_LOGIN_FIGURES) assert.ok(LOGIN_FIGURE_ICONS.includes(f.icon));
});
