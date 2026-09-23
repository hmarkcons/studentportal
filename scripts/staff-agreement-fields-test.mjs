import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAFF_MERGE_FIELDS,
  describeWorkDays,
  missingMergeFields,
  staffMergeVars,
  unknownMergeFields,
} from "../src/lib/staffAgreementFields.ts";

const staff = {
  full_name: "Ayesha Khan",
  designation: "Senior Counselor",
  cnic: "35202-1234567-1",
  date_of_birth: "1995-04-03",
  gender: "Female",
  marital_status: "Single",
  address: "12 Main Blvd, Lahore",
  mobile_official: "+92 300 1234567",
  mobile_personal: null,
  email_official: "ayesha@hmarkconsultants.com",
  email_personal: null,
  emergency_contact_name: "Imran Khan",
  emergency_contact_relation: "Brother",
  emergency_contact_number: "+92 321 7654321",
  work_start_time: "09:00:00",
  work_end_time: "18:00:00",
  work_days: [1, 2, 3, 4, 5],
  monthly_target: 8,
  roles: ["Counselor", "Processing"],
};
const pay = {
  monthly_salary: 120000,
  currency: "PKR",
  allowance: 15000,
  commission_rate_general: 5,
  commission_type_general: "percentage",
  commission_rate_public_universities: 5000,
  commission_type_public_universities: "flat",
  bonus_eligible: true,
  bonus_rate_percent: 10,
};
const extra = { agreementDate: "23 September 2026", signatoryName: "Abdul Hadi" };

test("every advertised placeholder gets a value", () => {
  const vars = staffMergeVars(staff, pay, extra);
  for (const f of STAFF_MERGE_FIELDS) assert.ok(f.key in vars, f.key);
});

test("pay reads the way a contract states it", () => {
  const vars = staffMergeVars(staff, pay, extra);
  assert.equal(vars.monthly_salary, "PKR 120,000.00");
  assert.equal(vars.allowance, "PKR 15,000.00");
  assert.equal(vars.total_monthly_pay, "PKR 135,000.00");
  assert.equal(vars.commission_general, "5%");
  assert.equal(vars.commission_public, "PKR 5,000.00 per registration");
  assert.equal(vars.bonus, "10% of salary");
});

test("hours, days, dates and contacts are written out", () => {
  const vars = staffMergeVars(staff, pay, extra);
  assert.equal(vars.working_hours, "9:00 AM – 6:00 PM");
  assert.equal(vars.entry_time, "9:00 AM");
  assert.equal(vars.exit_time, "6:00 PM");
  assert.equal(vars.working_days, "Monday – Friday");
  assert.equal(vars.date_of_birth, "3 April 1995");
  assert.equal(vars.emergency_contact, "Imran Khan (Brother) +92 321 7654321");
  assert.equal(vars.roles, "Counselor, Processing");
});

test("working days: a run is a range, anything else a list, Sunday last", () => {
  assert.equal(describeWorkDays([1, 2, 3, 4, 5, 6]), "Monday – Saturday");
  assert.equal(describeWorkDays([1, 3, 5]), "Monday, Wednesday, Friday");
  assert.equal(describeWorkDays([0, 6]), "Saturday, Sunday");
  assert.equal(describeWorkDays([]), "");
});

test("a contract that uses a field with no value is refused, by name", () => {
  // "a monthly salary of ." looks finished and gets signed.
  const vars = staffMergeVars(staff, { ...pay, monthly_salary: null }, extra);
  const missing = missingMergeFields("<p>Salary: {{monthly_salary}}. Name: {{staff_name}}.</p>", vars);
  assert.equal(missing.length, 1);
  assert.match(missing[0], /Monthly salary/);
});

test("a field the wording never uses is not required", () => {
  const vars = staffMergeVars(staff, null, extra);
  assert.deepEqual(missingMergeFields("<p>{{staff_name}} joins as {{designation}}.</p>", vars), []);
});

test("no pay record means no pay values, never zeros", () => {
  const vars = staffMergeVars(staff, null, extra);
  assert.equal(vars.monthly_salary, "");
  assert.equal(vars.bonus, "");
});

test("a student placeholder in a staff template is caught", () => {
  assert.deepEqual(unknownMergeFields("{{staff_name}} {{student_name}} {{fee_table}}"), ["student_name", "fee_table"]);
});

test("hours they have none of their own come from the office policy, as payroll does", () => {
  const policy = { work_start_time: "12:00:00", work_end_time: "21:00:00", work_days: [1, 2, 3, 4, 5, 6], grace_minutes: 15 };
  const vars = staffMergeVars({ ...staff, work_start_time: null, work_end_time: null, work_days: null }, pay, { ...extra, policy });
  assert.equal(vars.entry_time, "12:00 PM");
  assert.equal(vars.exit_time, "9:00 PM");
  assert.equal(vars.working_days, "Monday – Saturday");
  assert.equal(vars.grace_minutes, "15");
});

test("their own hours win over the office's", () => {
  const policy = { work_start_time: "12:00:00", work_end_time: "21:00:00", work_days: [1, 2, 3, 4, 5, 6], grace_minutes: 15 };
  const vars = staffMergeVars(staff, pay, { ...extra, policy });
  assert.equal(vars.entry_time, "9:00 AM");
  assert.equal(vars.working_days, "Monday – Friday");
});

test("midnight and noon read as a person would say them", () => {
  const vars = staffMergeVars({ ...staff, work_start_time: "00:30:00", work_end_time: "12:00:00" }, pay, extra);
  assert.equal(vars.entry_time, "12:30 AM");
  assert.equal(vars.exit_time, "12:00 PM");
});
