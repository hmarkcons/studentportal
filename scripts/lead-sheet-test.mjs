// The leads workbook (src/lib/leadSheet.ts): its columns, how a row is read,
// and what an import does to a lead already on file — adds, never overwrites.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_COLUMNS,
  orderedLeadColumns,
  readLeadColumnOrder,
  isExampleLead,
  leadColumnIndex,
  leadFromRow,
  leadHeaderKey,
  leadSheetRow,
  mergeIntoLead,
  monthLabel,
  parseLeadStatus,
  phoneKey,
} from "../src/lib/leadSheet.ts";

test("the columns are the list's, with the qualification, level and course right after the country", () => {
  const headers = LEAD_COLUMNS.map((c) => c.header);
  assert.equal(headers[0], "Month");
  const country = headers.indexOf("Country");
  assert.deepEqual(headers.slice(country, country + 4), ["Country", "Current qualification", "Applying for", "Course of interest"]);
  assert.equal(leadColumnIndex("date_of_inquiry"), 15, "the Month formula points at column O");
  assert.deepEqual(headers.slice(0, 3), ["Month", "City", "Name"], "City between Month and Name");
});

test("the month is worked out from the inquiry date", () => {
  assert.equal(monthLabel("2026-10-02"), "Oct 2026");
  assert.equal(monthLabel("2027-01-31T23:30:00+05:00"), "Jan 2027");
  assert.equal(monthLabel(null), "");
});

test("a heading is read however it was retyped", () => {
  assert.equal(leadHeaderKey("Contact number"), "contact_number");
  assert.equal(leadHeaderKey("contact_number"), "contact_number");
  assert.equal(leadHeaderKey("Name"), "full_name");
  assert.equal(leadHeaderKey(" Applying For "), "level_applying_for");
  assert.equal(leadHeaderKey("Counsellor"), "counselor");
  assert.equal(leadHeaderKey("Inquiry date"), "date_of_inquiry");
  assert.equal(leadHeaderKey("Something else"), null);
});

test("a status is read by its label or its key; Registered is never imported", () => {
  assert.equal(parseLeadStatus("Potential"), "potential");
  assert.equal(parseLeadStatus("meeting_done"), "meeting_done");
  const problems = [];
  const lead = leadFromRow({ name: "Ali", status: "Registered" }, problems);
  assert.equal(lead.status, null);
  assert.match(problems[0], /Ali: Registered is set by registering/);
});

test("a row is read into a lead, and what cannot be used is said and left out", () => {
  const problems = [];
  const lead = leadFromRow(
    {
      name: " Ali  Khan ",
      email: "ALI@Example.com",
      "applying for": "Masters",
      "inquiry date": "2026-09-14",
      "follow-up date": "next week",
      remarks: " Wants Italy ",
    },
    problems
  );
  assert.equal(lead.full_name, "Ali Khan");
  assert.equal(lead.email, "ali@example.com");
  assert.equal(lead.level_applying_for, "masters");
  assert.equal(lead.date_of_inquiry, "2026-09-14");
  assert.equal(lead.follow_up_date, null);
  assert.equal(lead.remarks, "Wants Italy");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Follow-up date "next week"/);

  assert.equal(leadFromRow({ email: "x@y.z" }, []), null, "a row with no name is not a lead");
  const p2 = [];
  assert.equal(leadFromRow({ name: "B", level: "Diploma" }, p2).level_applying_for, null);
  assert.match(p2[0], /not bachelors, masters or phd/);
});

test("the template's example row is recognised", () => {
  assert.equal(isExampleLead("Example Student (delete this row)"), true);
  assert.equal(isExampleLead("Ali"), false);
});

test("phone numbers match with or without the country code", () => {
  assert.equal(phoneKey("+92 300 1234567"), phoneKey("0300-1234567"));
  assert.notEqual(phoneKey("0300-1234567"), phoneKey("0300-7654321"));
});

const stored = {
  id: "l1",
  full_name: "Ali Khan",
  contact_number: "0300-1234567",
  email: null,
  country_of_interest: "Italy",
  current_qualification: null,
  level_applying_for: "bachelors",
  course_of_interest: "Computer Science",
  status: "potential",
  counselorName: "Sara",
  date_of_inquiry: "2026-09-01",
  platform_source: "Facebook",
  remark: "Call after 5",
  followUpDates: ["2026-10-10"],
};
const input = (over) => ({
  full_name: "Ali Khan",
  contact_number: null,
  email: null,
  country_of_interest: null,
  current_qualification: null,
  level_applying_for: null,
  course_of_interest: null,
  status: null,
  counselor: null,
  remarks: null,
  follow_up_date: null,
  follow_up_note: null,
  date_of_inquiry: null,
  platform_source: null,
  ...over,
});

test("a lead on file has its empty fields filled in", () => {
  const m = mergeIntoLead(stored, input({ email: "ali@example.com", current_qualification: "A-Levels" }));
  assert.deepEqual(m.patch, { email: "ali@example.com", current_qualification: "A-Levels" });
  assert.deepEqual(m.kept, []);
});

test("every value the sheet gives replaces the one on file", () => {
  const m = mergeIntoLead(
    stored,
    input({ full_name: "Ali K.", contact_number: "+92 300 1234567", level_applying_for: "masters", status: "meeting_done", counselor: "Omar", date_of_inquiry: "2026-09-20" })
  );
  assert.deepEqual(m.patch, { full_name: "Ali K.", level_applying_for: "masters", date_of_inquiry: "2026-09-20" }, "the same phone number written another way is not a change");
  assert.equal(m.status, "meeting_done");
  assert.equal(m.counselor, "Omar");
  assert.deepEqual(m.kept, []);
  assert.ok(m.added.includes("applying for bachelors → masters"));
  assert.ok(m.added.includes("name Ali Khan → Ali K."));
});

test("a country, course or source is replaced, not added beside; the same one changes nothing", () => {
  const m = mergeIntoLead(stored, input({ country_of_interest: "Germany", course_of_interest: "computer science", platform_source: "Instagram" }));
  assert.equal(m.patch.country_of_interest, "Germany");
  assert.equal(m.patch.platform_source, "Instagram");
  assert.equal("course_of_interest" in m.patch, false, "the same course in another case is not a change");
});

test("a blank cell changes nothing", () => {
  const m = mergeIntoLead(stored, input({}));
  assert.deepEqual(m.patch, {});
  assert.equal(m.status, null);
  assert.equal(m.counselor, null);
  assert.equal(m.remark, null);
  assert.deepEqual(m.added, []);
});

test("a remark is replaced by the sheet's; the same one is not saved again", () => {
  assert.equal(mergeIntoLead(stored, input({ remarks: "Budget tight" })).remark, "Budget tight");
  assert.equal(mergeIntoLead(stored, input({ remarks: "call after 5" })).remark, null);
  assert.equal(mergeIntoLead({ ...stored, remark: null }, input({ remarks: "First" })).remark, "First");
});

test("a registered student's status is not changed by a sheet", () => {
  const m = mergeIntoLead({ ...stored, status: "registered" }, input({ status: "in_discussion" }));
  assert.equal(m.status, null);
  assert.match(m.kept[0], /^status Registered \(the sheet says In Discussion/);
});

test("a follow-up is added unless the lead already has one that day", () => {
  assert.deepEqual(mergeIntoLead(stored, input({ follow_up_date: "2026-10-12", follow_up_note: "Send list" })).followUp, { date: "2026-10-12", note: "Send list" });
  assert.equal(mergeIntoLead(stored, input({ follow_up_date: "2026-10-10" })).followUp, null);
});

test("a lead with no counsellor or status takes the sheet's", () => {
  const m = mergeIntoLead({ ...stored, counselorName: null, status: null }, input({ counselor: "Omar", status: "meeting_done" }));
  assert.equal(m.counselor, "Omar");
  assert.equal(m.status, "meeting_done");
});

test("an Unattended lead takes the sheet's status: nobody has said where it stands yet (0316)", () => {
  assert.equal(mergeIntoLead({ ...stored, status: "unattended" }, input({ status: "meeting_done" })).status, "meeting_done");
  assert.equal(mergeIntoLead({ ...stored, status: "unattended" }, input({ status: "unattended" })).status, null, "the same says nothing new");
  assert.equal(mergeIntoLead({ ...stored, status: "in_discussion" }, input({ status: "unattended" })).status, "unattended", "the sheet's word, whatever it is");
});

test("Unattended is read from a sheet by its label", () => {
  const problems = [];
  assert.equal(leadFromRow({ name: "Ali", status: "Unattended" }, problems).status, "unattended");
  assert.deepEqual(problems, []);
});

test("an exported row has every piece of the lead in its own cell", () => {
  const row = leadSheetRow({
    full_name: "Ali Khan",
    contact_number: "0300-1234567",
    email: "ali@example.com",
    country_of_interest: "Italy",
    current_qualification: "A-Levels",
    level_applying_for: "bachelors",
    course_of_interest: "CS",
    status: "meeting_done",
    counselorName: "Sara",
    remark: "Call after 5",
    nextFollowUp: { date: "2026-10-10", note: "Send list" },
    date_of_inquiry: "2026-09-01",
    platform_source: "Facebook",
  });
  assert.deepEqual(Object.keys(row).sort(), LEAD_COLUMNS.map((c) => c.key).sort());
  assert.equal(row.month, "Sep 2026");
  assert.equal(row.status, "Meeting Done");
  assert.equal(row.follow_up_date, "2026-10-10");
  assert.equal(row.counselor, "Sara");
});

test("a Super Admin's order is followed, the follow-up note always beside its date", () => {
  // Source moved to the front, Follow-up to second.
  const arranged = LEAD_COLUMNS.map((c) => c.key).filter((k) => !["platform_source", "follow_up_date", "follow_up_note"].includes(k));
  const keys = orderedLeadColumns(["platform_source", "follow_up_date", ...arranged]).map((c) => c.key);
  assert.deepEqual(keys.slice(0, 4), ["platform_source", "follow_up_date", "follow_up_note", "month"]);
  assert.equal(keys.length, LEAD_COLUMNS.length, "every column is still there");
});

test("a column the stored order does not name takes its default place", () => {
  // Saved before City existed: City lands after Month, where it is by default.
  const keys = orderedLeadColumns(["month", "full_name", "email"]).map((c) => c.key);
  assert.deepEqual(keys.slice(0, 5), ["month", "city", "full_name", "contact_number", "email"]);
});

test("nothing usable stored is the default order", () => {
  assert.deepEqual(orderedLeadColumns(null).map((c) => c.key), LEAD_COLUMNS.map((c) => c.key));
  assert.equal(readLeadColumnOrder(["nonsense", 3]), null);
  assert.deepEqual(readLeadColumnOrder(["email", "email", "month"]), ["email", "month"]);
});
