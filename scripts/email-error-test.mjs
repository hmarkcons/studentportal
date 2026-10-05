// What a failed email says to the person who pressed Send.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emailErrorMessage } from "../src/lib/emailError.ts";

test("a refused login says it is the portal's mailbox password, and what to do", () => {
  const msg = emailErrorMessage(Object.assign(new Error("Invalid login: 535 Incorrect authentication data"), { code: "EAUTH", responseCode: 535 }));
  assert.match(msg, /^Nothing was sent: the mail server refused the portal's login \(535\)/);
  assert.match(msg, /SMTP_PASS in Vercel/);
  assert.match(emailErrorMessage(new Error("Invalid login: 535 Incorrect authentication data")), /refused the portal's login/, "known by its words alone");
});

test("a server that cannot be reached is said so", () => {
  assert.match(emailErrorMessage(Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" })), /could not be reached/);
});

test("a refused address points at the address", () => {
  assert.match(emailErrorMessage(Object.assign(new Error("550 5.1.1 Recipient address rejected: User unknown"), { responseCode: 550 })), /refused the address \(550\)/);
});

test("anything else keeps its own words", () => {
  assert.equal(emailErrorMessage(new Error("Message too large")), "Message too large");
  assert.equal(emailErrorMessage(null), "Failed to send email.");
});

// ---------------------------------------------------------- undeliverable
import { isUndeliverableAddress } from "../src/lib/emailRecipients.ts";

test("an address under a reserved test domain is never sent to", () => {
  assert.equal(isUndeliverableAddress("zztmp-leadswork@hmark-test.local"), true);
  assert.equal(isUndeliverableAddress("zztmp-dashboard@example.invalid"), true);
  assert.equal(isUndeliverableAddress("someone@example.com"), true);
  assert.equal(isUndeliverableAddress("a@mail.example.org"), true);
  assert.equal(isUndeliverableAddress("x@foo.test"), true);
});

test("a real address is sent to", () => {
  assert.equal(isUndeliverableAddress("accounts@hmarkconsultants.com"), false);
  assert.equal(isUndeliverableAddress("student@gmail.com"), false);
  assert.equal(isUndeliverableAddress("someone@notexample.com"), false, "only the reserved domain itself, not a name ending in it");
  assert.equal(isUndeliverableAddress("not-an-address"), false);
});
