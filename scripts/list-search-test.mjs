// The words a search box sends to the database (src/lib/listSearch.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ilikeAny, looksLikeEmail, searchTerm } from "../src/lib/listSearch.ts";

test("an email address is searched as it is written, underscore and all", () => {
  assert.equal(searchTerm("ali_khan@gmail.com"), "ali_khan@gmail.com");
  assert.equal(searchTerm("  Ali.Khan+uni@Gmail.com "), "Ali.Khan+uni@Gmail.com");
  assert.equal(searchTerm("mailto:ali@x.pk"), "ali@x.pk");
  assert.ok(looksLikeEmail("ali_khan@gmail.com"));
  assert.ok(looksLikeEmail("@gmail.com"), "the end of an address");
  assert.ok(!looksLikeEmail("ali khan"));
});

test("what would break the filter is taken out", () => {
  assert.equal(searchTerm('a,b(c)d"e\'f*g%h\\i'), "a b c d e f g h i");
  assert.equal(searchTerm("   "), "");
  assert.equal(searchTerm(null), "");
  assert.equal(searchTerm("x".repeat(150)).length, 100);
});

test("one term, looked for in each column", () => {
  assert.equal(ilikeAny(["full_name", "email"], "ali_khan@gmail.com"), 'full_name.ilike."%ali_khan@gmail.com%",email.ilike."%ali_khan@gmail.com%"');
});
