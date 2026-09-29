// The registered student's menu (src/lib/studentNav.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { studentNav } from "../src/lib/studentNav.ts";

const labels = (items) => items.map((i) => i.label);

test("Applications has its own entry, after Documents", () => {
  const nav = labels(studentNav({ locked: false, scholarship: false, travel: false }));
  assert.deepEqual(nav.slice(0, 5), ["Dashboard", "Profile", "Documents", "Applications", "Visa"]);
});

test("Scholarship follows Applications when the country offers one", () => {
  const nav = labels(studentNav({ locked: false, scholarship: true, travel: false }));
  assert.equal(nav[nav.indexOf("Applications") + 1], "Scholarship");
  assert.equal(labels(studentNav({ locked: false, scholarship: false, travel: false })).includes("Scholarship"), false);
});

test("Travel & Arrival sits after Visa, once a visa is issued", () => {
  const nav = labels(studentNav({ locked: false, scholarship: true, travel: true }));
  assert.equal(nav[nav.indexOf("Visa") + 1], "Travel & Arrival");
  assert.equal(labels(studentNav({ locked: false, scholarship: true, travel: false })).includes("Travel & Arrival"), false);
});

test("behind the agreement gate only the pages it allows are offered", () => {
  const nav = labels(studentNav({ locked: true, scholarship: true, travel: true }));
  assert.deepEqual(nav, ["Payments", "Agreement", "Support"]);
});

test("unread counts become badges on their entries", () => {
  const nav = studentNav({ locked: false, scholarship: false, travel: false, badges: { "/portal/messages": 2 } });
  assert.equal(nav.find((i) => i.label === "Messages").badge, 2);
  assert.equal("badge" in nav.find((i) => i.label === "Support"), false);
});

test("Calendar sits right after Appointments, with the calendar icon", () => {
  const nav = studentNav({ locked: false, scholarship: true, travel: true });
  const names = labels(nav);
  assert.equal(names[names.indexOf("Appointments") + 1], "Calendar");
  const entry = nav.find((i) => i.label === "Calendar");
  assert.equal(entry.href, "/portal/calendar");
  assert.equal(entry.icon, "calendar");
});

test("the whole menu, in order", () => {
  assert.deepEqual(labels(studentNav({ locked: false, scholarship: true, travel: true })), [
    "Dashboard",
    "Profile",
    "Documents",
    "Applications",
    "Scholarship",
    "Visa",
    "Travel & Arrival",
    "Appointments",
    "Calendar",
    "Payments",
    "Agreement",
    "Messages",
    "Support",
    "Guide",
  ]);
});
