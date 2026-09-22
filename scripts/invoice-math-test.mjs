import test from "node:test";
import assert from "node:assert/strict";
import {
  computeInvoiceMath,
  buildInstallmentPlan,
  extrasLoad,
  feeLineLabel,
  installmentNote,
  sumAdminCharges,
  sumLineItems,
} from "../src/lib/invoiceMath.ts";

// The figures the production check (verify-invoice-flow.mjs) is built on:
// a 1,800 fee, a 300 administrative charge, 5% SRB tax, three instalments.
const BASE = { consultancyFee: 1800, adminCharge: 300, discountAmount: 0, taxRate: 5 };
const eur = (n) => `EUR ${n.toFixed(2)}`;

test("without added items the money is what it always was", () => {
  const m = computeInvoiceMath(BASE);
  assert.equal(m.taxAmount, 90);
  assert.equal(m.total, 2190);
  assert.equal(m.extrasAmount, 0);
  assert.equal(m.extrasTaxAmount, 0);
  assert.equal(m.taxableAmount, 1800);
});

test("an added item is taxed at the invoice's rate and counted in the total", () => {
  const m = computeInvoiceMath({ ...BASE, extras: 100 });
  assert.equal(m.extrasAmount, 100);
  assert.equal(m.taxableAmount, 1900);
  assert.equal(m.taxAmount, 95);
  assert.equal(m.extrasTaxAmount, 5);
  // 1800 + 100 + 95 + 300
  assert.equal(m.total, 2295);
});

test("the discount comes off the fee, never off an added item", () => {
  const m = computeInvoiceMath({ consultancyFee: 2000, adminCharge: 300, discountAmount: 150, taxRate: 5, extras: 100 });
  assert.equal(m.netConsultancyFee, 1850);
  assert.equal(m.taxableAmount, 1950);
  assert.equal(m.taxAmount, 97.5);
  assert.equal(m.total, 2347.5);
  // A discount larger than the fee is still clamped to the fee, not to fee + items.
  const clamped = computeInvoiceMath({ consultancyFee: 100, adminCharge: 0, discountAmount: 150, taxRate: 0, extras: 100 });
  assert.equal(clamped.discountAmount, 100);
  assert.equal(clamped.total, 100);
});

test("an invoice with no tax puts no tax on its items either", () => {
  const m = computeInvoiceMath({ ...BASE, taxRate: 0, extras: 100 });
  assert.equal(m.taxAmount, 0);
  assert.equal(m.extrasTaxAmount, 0);
  assert.equal(m.total, 2200);
});

test("a negative item amount cannot discount the invoice", () => {
  assert.equal(computeInvoiceMath({ ...BASE, extras: -50 }).total, 2190);
});

test("sumLineItems adds what PostgREST returns and ignores what it should", () => {
  assert.equal(sumLineItems([{ amount: 100 }, { amount: "25.50" }, { amount: null }, { amount: -5 }, { amount: "junk" }]), 125.5);
  assert.equal(sumLineItems([]), 0);
  assert.equal(sumLineItems(null), 0);
  assert.equal(sumLineItems(undefined), 0);
});

test("added items ride on the first instalment with the admin charge, and the parts still sum to the total", () => {
  const m = computeInvoiceMath({ ...BASE, extras: 100 });
  const parts = buildInstallmentPlan(m, 3);
  // 1800 + 90 fee-side tax = 1890, in three = 630 each; the first also carries
  // 300 admin + 100 item + 5 tax on the item.
  assert.deepEqual(parts, [1035, 630, 630]);
  assert.equal(extrasLoad(m), 105);
  assert.equal(Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100, m.total);
});

test("the schedule sums to the total exactly even when nothing divides evenly", () => {
  for (const extras of [33.33, 0.01, 999.99, 7]) {
    for (const count of [1, 2, 3, 7, 9, 24]) {
      const m = computeInvoiceMath({ consultancyFee: 1000, adminCharge: 250, discountAmount: 0, taxRate: 5, extras });
      const parts = buildInstallmentPlan(m, count);
      const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
      assert.equal(sum, m.total, `extras ${extras} over ${count}`);
      assert.equal(parts.length, count);
    }
  }
});

test("a single instalment carries everything", () => {
  const m = computeInvoiceMath({ ...BASE, extras: 100 });
  assert.deepEqual(buildInstallmentPlan(m, 1), [2295]);
});

test("installmentNote explains the admin fee on the first instalment and added items wherever they landed", () => {
  const m = computeInvoiceMath({ ...BASE, extras: 100 });
  assert.equal(
    installmentNote({ installment_no: 1, extras_amount: 105 }, m, eur),
    "includes the EUR 300.00 admin fee and EUR 105.00 for added items"
  );
  assert.equal(installmentNote({ installment_no: 1, extras_amount: 0 }, m, eur), "includes the EUR 300.00 admin fee");
  assert.equal(installmentNote({ installment_no: 2, extras_amount: 105 }, m, eur), "includes EUR 105.00 for added items");
  assert.equal(installmentNote({ installment_no: 2, extras_amount: 0 }, m, eur), null);
  assert.equal(installmentNote({ installment_no: 2 }, m, eur), null);
});

test("installmentNote reads a numeric column however PostgREST sends it", () => {
  const m = computeInvoiceMath(BASE);
  assert.equal(installmentNote({ installment_no: 3, extras_amount: "105.00" }, m, eur), "includes EUR 105.00 for added items");
  assert.equal(installmentNote({ installment_no: 3, extras_amount: null }, m, eur), null);
});

test("no admin charge and no items means nothing to explain", () => {
  const m = computeInvoiceMath({ ...BASE, adminCharge: 0 });
  assert.equal(installmentNote({ installment_no: 1, extras_amount: 0 }, m, eur), null);
});

test("a charge is named for the country it is for", () => {
  assert.equal(feeLineLabel("Consultancy Fee", "Italy (Public)"), "Consultancy Fee — Italy (Public)");
  assert.equal(feeLineLabel("Administrative Fee", "Italy (Public)"), "Administrative Fee — Italy (Public)");
  assert.equal(feeLineLabel("Administrative Fee", "Hungary", true), "Administrative Fee — Hungary (Backup)");
});

test("a charge with no country on it keeps its plain name rather than trailing a dash", () => {
  assert.equal(feeLineLabel("Administrative Fee", null), "Administrative Fee");
  assert.equal(feeLineLabel("Administrative Fee", ""), "Administrative Fee");
  assert.equal(feeLineLabel("Administrative Fee", "   "), "Administrative Fee");
  assert.equal(feeLineLabel("Administrative Fee", undefined, true), "Administrative Fee");
});

test("the per-country charges add up to the figure the arithmetic uses", () => {
  const charges = [{ amount: 300 }, { amount: "150.50" }, { amount: 75 }];
  assert.equal(sumAdminCharges(charges), 525.5);
  assert.equal(sumAdminCharges([]), 0);
  assert.equal(sumAdminCharges(null), 0);
  // A negative or unreadable slice cannot pull the total down.
  assert.equal(sumAdminCharges([{ amount: 300 }, { amount: -50 }, { amount: "junk" }, { amount: null }]), 300);
});

test("a student with backups is billed one consultancy fee and every admin fee", () => {
  // Italy primary 300, Hungary backup 150, Romania backup 75 — the invoice's
  // single adminCharge is their sum, which is what the schedule collects.
  const charges = [{ amount: 300 }, { amount: 150 }, { amount: 75 }];
  const m = computeInvoiceMath({ ...BASE, adminCharge: sumAdminCharges(charges) });
  assert.equal(m.adminCharge, 525);
  // The administrative charge stays outside the tax base, per country as before.
  assert.equal(m.taxAmount, 90);
  assert.equal(m.total, 1800 + 90 + 525);
  assert.deepEqual(buildInstallmentPlan(m, 3), [1155, 630, 630]);
});
