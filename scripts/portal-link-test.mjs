// The login page kept beside each saved login (src/lib/portalLink.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { hmarkSignInLink, mergeLogin, parsePortalLink, parseStoredLogin, suggestedPortalLink } from "../src/lib/portalLink.ts";

test("a typed link is kept as a web address, or refused", () => {
  assert.deepEqual(parsePortalLink("https://portal.unipi.it/login"), { link: "https://portal.unipi.it/login" });
  assert.deepEqual(parsePortalLink("  portal.unipi.it/login "), { link: "https://portal.unipi.it/login" }, "https:// in front of a bare address");
  assert.deepEqual(parsePortalLink(""), { link: null });
  assert.deepEqual(parsePortalLink(null), { link: null });
  assert.ok("error" in parsePortalLink("javascript:alert(1)"), "never a script");
  assert.ok("error" in parsePortalLink("the university website"), "words are not a link");
  assert.ok("error" in parsePortalLink("Apply at https://x.it by March"), "a sentence is not a link");
  assert.ok("error" in parsePortalLink(`https://x.it/${"a".repeat(2100)}`));
});

test("a stored login reads back, whenever it was saved", () => {
  assert.deepEqual(parseStoredLogin('{"username":"ayesha","password":"pw","link":"https://visa.vfs.it"}'), { username: "ayesha", password: "pw", link: "https://visa.vfs.it" });
  assert.deepEqual(parseStoredLogin('{"username":"ayesha","password":"pw"}'), { username: "ayesha", password: "pw", link: null }, "saved before links");
  assert.deepEqual(parseStoredLogin("plain-old"), { username: "plain-old", password: "", link: null }, "saved before JSON");
  assert.deepEqual(parseStoredLogin(null), { username: "", password: "", link: null });
  assert.equal(parseStoredLogin('{"username":"a","password":"b","link":"javascript:alert(1)"}').link, null, "a bad link stored by hand is not a link");
});

test("a blank username or password keeps the one on file; the link is what the field holds", () => {
  const stored = { username: "ayesha", password: "old", link: "https://a.it" };
  assert.deepEqual(mergeLogin(stored, { username: "", password: "", link: "https://b.it" }), { username: "ayesha", password: "old", link: "https://b.it" }, "adding a link keeps the password");
  assert.deepEqual(mergeLogin(stored, { username: "", password: "new", link: "https://a.it" }), { username: "ayesha", password: "new", link: "https://a.it" });
  assert.deepEqual(mergeLogin(stored, { username: "x", password: "y", link: null }), { username: "x", password: "y", link: null }, "an emptied link field removes it");
  assert.deepEqual(mergeLogin(stored, { username: "", password: "" }), stored, "a form without the field leaves the link alone");
});

test("a link is suggested from what is on file, or the login's known page", () => {
  assert.equal(suggestedPortalLink("gmail"), "https://mail.google.com/");
  assert.equal(suggestedPortalLink("university_portal", "apply.unipi.it"), "https://apply.unipi.it");
  assert.equal(suggestedPortalLink("university_portal", "see the website"), null, "words on file are not offered");
  assert.equal(suggestedPortalLink("university_portal"), null);
  assert.equal(hmarkSignInLink("https://portal.hmarkconsultants.com/"), "https://portal.hmarkconsultants.com/login");
});
