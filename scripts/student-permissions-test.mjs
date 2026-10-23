import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PERMISSION_KEYS, STUDENT_SECTION_PERMISSIONS } from "../src/lib/permissions.ts";

const studentKeys = Object.values(STUDENT_SECTION_PERMISSIONS).flatMap((ops) => Object.values(ops));

test("every student-section permission is a declared PERMISSION_KEY", () => {
  for (const k of studentKeys) {
    assert.ok(PERMISSION_KEYS.includes(k), `${k} is missing from PERMISSION_KEYS`);
  }
});

test("the student-section map has the 14 real operations, unique and namespaced", () => {
  // Profile/Applications/Documents/Scholarship get add+edit+delete (12); Visa
  // edit and Communication send are the only real writes those sections have.
  assert.equal(studentKeys.length, 14);
  assert.equal(new Set(studentKeys).size, 14);
  assert.ok(studentKeys.every((k) => k.startsWith("student.")));
});

test("migration 0343 seeds exactly the student.* keys the code declares", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0343_student_section_permissions.sql", import.meta.url), "utf8");
  // The keys appear single-quoted in the VALUES rows; the comment never quotes one.
  const seeded = new Set([...sql.matchAll(/'(student\.[a-z_.]+)'/g)].map((m) => m[1]));
  for (const k of studentKeys) assert.ok(seeded.has(k), `${k} is declared in code but not seeded in 0343`);
  for (const k of seeded) assert.ok(studentKeys.includes(k), `${k} is seeded in 0343 but not declared in code`);
});
