import test from "node:test";
import assert from "node:assert/strict";
import { callLink, callAbsenceNote } from "../src/lib/scholarshipCallLink.ts";

test("the copy we hold wins over the region's own link", () => {
  const link = callLink({
    call_pdf_signed_url: "https://supabase/signed/bando.pdf",
    call_pdf_url: "https://ergo.it/bando.pdf",
    call_page_url: "https://ergo.it/bandi",
  });
  assert.equal(link.kind, "stored");
  assert.equal(link.url, "https://supabase/signed/bando.pdf");
});

test("the region's PDF wins over the region's page", () => {
  const link = callLink({ call_pdf_url: "https://ergo.it/bando.pdf", call_page_url: "https://ergo.it/bandi" });
  assert.equal(link.kind, "pdf");
  assert.equal(link.url, "https://ergo.it/bando.pdf");
});

test("a page is used when there is no PDF to point at", () => {
  const link = callLink({ call_page_url: "https://ersucatania.it/bandi" });
  assert.equal(link.kind, "page");
  assert.equal(link.label, "Call for applications");
});

test("the language is said on the paper, because most calls are Italian-only", () => {
  assert.equal(callLink({ call_pdf_url: "https://x/y.pdf", call_pdf_language: "it" }).label, "Call for applications (Italian)");
  assert.equal(callLink({ call_pdf_url: "https://x/y.pdf", call_pdf_language: "en" }).label, "Call for applications (English)");
  assert.equal(callLink({ call_pdf_url: "https://x/y.pdf", call_pdf_language: null }).label, "Call for applications");
});

test("a page is not labelled with the PDF's language", () => {
  // call_pdf_language describes a PDF. Carrying it onto a page link would
  // promise an English page off the back of an English PDF we do not hold.
  const link = callLink({ call_page_url: "https://x/bandi", call_pdf_language: "en" });
  assert.equal(link.label, "Call for applications");
  assert.equal(link.language, null);
});

test("nothing on file is null, not an empty link", () => {
  assert.equal(callLink({}), null);
  assert.equal(callLink({ call_pdf_url: null, call_page_url: null }), null);
});

test("blank and whitespace-only URLs count as nothing", () => {
  // A cleared field in the Setup form posts "", not null.
  assert.equal(callLink({ call_pdf_url: "", call_page_url: "   " }), null);
  assert.equal(callLink({ call_pdf_signed_url: "  ", call_page_url: "https://x/bandi" }).kind, "page");
});

test("an unpublished call says so, with the date when the region gave one", () => {
  assert.match(
    callAbsenceNote({ call_status: "awaiting", call_expected_on: "July 2026" }),
    /not published.*expected around July 2026/
  );
  assert.match(callAbsenceNote({ call_status: "awaiting" }), /not published/);
});

test("a published call with no link blames nobody and offers the counsellor", () => {
  assert.match(callAbsenceNote({ call_status: "published" }), /counsellor/);
});

test("a note in a link field is passed over for the next link, never linked (0304)", () => {
  const link = callLink({ call_pdf_url: "see the regional page", call_page_url: "www.ergo.it/bandi" });
  assert.equal(link.kind, "page");
  assert.equal(link.url, "https://www.ergo.it/bandi");
  assert.equal(callLink({ call_pdf_url: "javascript:alert(1)" }), null);
});

test("an expected date in words is said as written", () => {
  assert.match(callAbsenceNote({ call_status: "awaiting", call_expected_text: "Early July", call_expected_on: null }), /expected around Early July\./);
  assert.match(callAbsenceNote({ call_status: "awaiting", call_expected_on: "2027-07-01" }), /expected around 2027-07-01\./);
});
