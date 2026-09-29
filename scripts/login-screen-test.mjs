// The login screen's content rules (src/lib/loginScreen.ts).
import test from "node:test";
import assert from "node:assert/strict";
import {
  LOGIN_SCREEN_DEFAULTS,
  readLoginScreen,
  parseLoginScreenForm,
  isSafeLink,
  contrastRatio,
  footerLine,
  isStudentIdentifier,
  normaliseStudentId,
  loginPictureUrl,
  DEFAULT_LOGIN_PICTURE,
} from "../src/lib/loginScreen.ts";

const form = (values) => (name) => values[name];

test("nothing stored is the reference design", () => {
  assert.deepEqual(readLoginScreen({}), LOGIN_SCREEN_DEFAULTS);
  assert.deepEqual(readLoginScreen(null), LOGIN_SCREEN_DEFAULTS);
  assert.equal(LOGIN_SCREEN_DEFAULTS.headline, "Your Future Goes Beyond Borders");
  assert.equal(LOGIN_SCREEN_DEFAULTS.staffTab, "Counsellor");
  assert.equal(LOGIN_SCREEN_DEFAULTS.accentColor, "#0b7a52");
});

test("what is stored is laid over the defaults, the rest kept", () => {
  const c = readLoginScreen({ headline: "Study in Europe", accentColor: "#123456" });
  assert.equal(c.headline, "Study in Europe");
  assert.equal(c.accentColor, "#123456");
  assert.equal(c.welcomeTitle, "Welcome back");
});

test("a stored value that breaks a rule falls back rather than reaching the page", () => {
  const c = readLoginScreen({ ctaUrl: "javascript:alert(1)", accentColor: "#ffffff", headline: "   ", eyebrow: "x".repeat(200) });
  assert.equal(c.ctaUrl, LOGIN_SCREEN_DEFAULTS.ctaUrl);
  assert.equal(c.accentColor, LOGIN_SCREEN_DEFAULTS.accentColor);
  assert.equal(c.headline, LOGIN_SCREEN_DEFAULTS.headline);
  assert.equal(c.eyebrow, LOGIN_SCREEN_DEFAULTS.eyebrow);
});

test("links: web addresses, mail and phone links and site paths, never script", () => {
  for (const ok of ["https://hmarkconsultants.com", "http://example.com/x", "mailto:info@hmark.com", "tel:+923001234567", "/register/partner"]) {
    assert.equal(isSafeLink(ok), true, ok);
  }
  for (const bad of ["javascript:alert(1)", "data:text/html,hi", "//evil.com", "/\\evil.com", "hmark.com", "", "ftp://x.com"]) {
    assert.equal(isSafeLink(bad), false, bad);
  }
});

test("saving keeps only what differs from the defaults, and a blank means the original", () => {
  const values = Object.fromEntries(Object.entries(LOGIN_SCREEN_DEFAULTS));
  values.headline = "Study in Europe";
  values.welcomeTitle = "";
  values.accentColor = "#0B7A52"; // the default, in capitals
  const parsed = parseLoginScreenForm(form(values));
  assert.deepEqual(parsed, { content: { headline: "Study in Europe" } });
});

test("saving refuses an unsafe link, a pale colour and an overlong text, saying which", () => {
  assert.match(parseLoginScreenForm(form({ ctaUrl: "javascript:alert(1)" })).error, /The button/);
  assert.match(parseLoginScreenForm(form({ accentColor: "#bfe8d5" })).error, /too light for white text/);
  assert.match(parseLoginScreenForm(form({ headingColor: "#9aa0a6" })).error, /too light to read/);
  assert.match(parseLoginScreenForm(form({ accentColor: "green" })).error, /pick a colour/);
  assert.match(parseLoginScreenForm(form({ headline: "x".repeat(81) })).error, /80 characters/);
});

test("the reference's colours pass their own contrast rules", () => {
  assert.ok(contrastRatio(LOGIN_SCREEN_DEFAULTS.accentColor, "#ffffff") >= 4.5);
  assert.ok(contrastRatio(LOGIN_SCREEN_DEFAULTS.headingColor, "#ffffff") >= 12);
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
});

test("the footer is the copyright and year, then the office's line", () => {
  assert.equal(footerLine(LOGIN_SCREEN_DEFAULTS, 2026), "© 2026 HMARK Consultants · Suite 101, Dashtiyar Chambers, University Road, Karachi");
});

test("a Student ID is anything without an @, matched however it was typed", () => {
  assert.equal(isStudentIdentifier("HMC-FALL26-IT-0012"), true);
  assert.equal(isStudentIdentifier("ali@example.com"), false);
  assert.equal(normaliseStudentId("  hmc-fall26-it-0012 "), "HMC-FALL26-IT-0012");
  assert.equal(normaliseStudentId("HMC-FALL26 -IT-0012"), "HMC-FALL26-IT-0012");
});

test("the picture: an uploaded one from the public bucket, else the one that ships", () => {
  assert.equal(loginPictureUrl(null, "https://x.supabase.co"), DEFAULT_LOGIN_PICTURE);
  assert.equal(
    loginPictureUrl("login/picture-1.webp", "https://x.supabase.co/"),
    "https://x.supabase.co/storage/v1/object/public/site-assets/login/picture-1.webp"
  );
});
