// The company as agreements print it (0288): the office line, the settings
// that feed it, the form that edits them and the {{company_…}} placeholders.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AGREEMENT_COMPANY,
  companyFromSettings,
  companyFromForm,
  companyMergeVars,
  missingCompanyFields,
  officeLine,
} from "../src/lib/agreementCompany.ts";
import { MERGE_FIELDS } from "../src/lib/pdf/templateWording.ts";
import { STAFF_TEMPLATE_FIELDS, missingMergeFields, unknownMergeFields } from "../src/lib/staffAgreementFields.ts";

// What the builder's templates and staff agreements printed, verbatim, before
// the details were editable. Nothing may move until the Super Admin edits.
const PRINTED_BEFORE =
  "HMARK Consultants - Office Address: Suite 101, Dashtiyar Chambers, Opp. Urdu Federal University, Gulshan-e-Iqbal, Block 13-C, University Road, Karachi, Pakistan. Landline #: 021 34 999 777";

test("with the defaults, the office line is exactly what agreements printed", () => {
  assert.equal(officeLine(DEFAULT_AGREEMENT_COMPANY), PRINTED_BEFORE);
  assert.equal(officeLine(companyFromSettings(null)), PRINTED_BEFORE);
});

test("the row the migration seeds prints the same line", () => {
  const seeded = companyFromSettings({
    company_name: "HMARK Consultants",
    office_address: DEFAULT_AGREEMENT_COMPANY.address,
    landline: "021 34 999 777",
    mobile: null,
    email: null,
    website: null,
  });
  assert.equal(officeLine(seeded), PRINTED_BEFORE);
});

test("edited details print in the same shape, further contacts after the landline", () => {
  const c = companyFromSettings({
    company_name: "HMARK Consultants (Pvt.) Ltd.",
    office_address: "Office 12, Clifton Block 5, Karachi.",
    landline: "021 111 222 333",
    mobile: "0334 3297870",
    email: "info@hmarkconsultants.com",
    website: "www.hmarkconsultants.com",
  });
  assert.equal(
    officeLine(c),
    "HMARK Consultants (Pvt.) Ltd. - Office Address: Office 12, Clifton Block 5, Karachi. Landline #: 021 111 222 333 | Mobile #: 0334 3297870 | Email: info@hmarkconsultants.com | Website: www.hmarkconsultants.com"
  );
});

test("a cleared landline leaves the line with the address alone", () => {
  const c = companyFromSettings({ company_name: "HMARK Consultants", office_address: "Karachi", landline: "", mobile: null, email: null, website: null });
  assert.equal(officeLine(c), "HMARK Consultants - Office Address: Karachi.");
});

test("a blank name or address keeps its default rather than printing an agreement from nobody", () => {
  const c = companyFromSettings({ company_name: "  ", office_address: "", landline: null });
  assert.equal(c.companyName, "HMARK Consultants");
  assert.equal(c.address, DEFAULT_AGREEMENT_COMPANY.address);
  assert.equal(c.landline, null);
});

test("the form joins an address typed over lines, and trims everything", () => {
  const form = { company_name: " HMARK ", office_address: "Suite 101\n  Karachi\n\nPakistan ", landline: "", email: "", website: "", mobile: "" };
  const read = companyFromForm((k) => form[k]);
  assert.equal(read.error, undefined);
  assert.deepEqual(read.row, {
    company_name: "HMARK",
    office_address: "Suite 101, Karachi, Pakistan",
    landline: null,
    mobile: null,
    email: null,
    website: null,
  });
});

test("the form refuses a missing name or address and a bad email", () => {
  assert.match(companyFromForm((k) => ({ office_address: "Karachi" })[k]).error, /company name/);
  assert.match(companyFromForm((k) => ({ company_name: "HMARK" })[k]).error, /office address/);
  assert.match(companyFromForm((k) => ({ company_name: "HMARK", office_address: "Karachi", email: "accounts" })[k]).error, /email/);
  assert.match(companyFromForm((k) => ({ company_name: "HMARK", office_address: "x".repeat(401) })[k]).error, /longer than 400/);
});

test("the placeholders print the company, and the whole office line", () => {
  const vars = companyMergeVars(DEFAULT_AGREEMENT_COMPANY);
  assert.equal(vars.company_name, "HMARK Consultants");
  assert.equal(vars.company_landline, "021 34 999 777");
  assert.equal(vars.company_email, "");
  assert.equal(vars.office_line, PRINTED_BEFORE);
});

test("a placeholder with nothing to print is named before a contract goes out", () => {
  assert.deepEqual(missingCompanyFields("Write to {{company_email}} or call {{company_landline}}.", DEFAULT_AGREEMENT_COMPANY), ["email"]);
  assert.deepEqual(missingCompanyFields("No placeholders here.", DEFAULT_AGREEMENT_COMPANY), []);
  assert.deepEqual(missingCompanyFields(null, DEFAULT_AGREEMENT_COMPANY), []);
});

test("both builders offer the company placeholders", () => {
  for (const key of ["company_name", "company_address", "office_line"]) {
    assert.ok(MERGE_FIELDS.some((f) => f.key === key), `student templates: ${key}`);
    assert.ok(STAFF_TEMPLATE_FIELDS.some((f) => f.key === key), `staff templates: ${key}`);
  }
});

test("a staff template may use them, and a blank one is not blamed on the staff record", () => {
  assert.deepEqual(unknownMergeFields("{{staff_name}} works at {{company_address}}"), []);
  assert.deepEqual(missingMergeFields("{{company_email}}", { company_email: "" }), []);
});
