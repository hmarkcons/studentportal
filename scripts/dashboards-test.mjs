import { test } from "node:test";
import assert from "node:assert/strict";
import { counselorLeaderboard, summarizeSales, FOLLOW_UP_AFTER_DAYS } from "../src/lib/dashboards/sales.ts";
import { officerTable, summarizeProcessing } from "../src/lib/dashboards/processing.ts";
import { paidOn, summarizeFinance } from "../src/lib/dashboards/finance.ts";
import { summarizeLeadGen, summarizeSocial } from "../src/lib/dashboards/marketing.ts";
import { addDays, daysBetween, karachiDay, karachiMonth, previousMonth } from "../src/lib/dashboards/dates.ts";

const TODAY = "2026-09-24";
const MONTHS = [
  { key: "2026-07", label: "Jul 26" },
  { key: "2026-08", label: "Aug 26" },
  { key: "2026-09", label: "Sep 26" },
];

// ------------------------------------------------------------------ dates

test("a timestamp counts on the Karachi day, five hours ahead of UTC", () => {
  assert.equal(karachiDay("2026-08-31T20:00:00Z"), "2026-09-01");
  assert.equal(karachiMonth("2026-08-31T18:59:00Z"), "2026-08");
  assert.equal(karachiDay("2026-09-01"), "2026-09-01", "a bare date stays put");
  assert.equal(karachiDay(null), "");
  assert.equal(daysBetween("2026-09-20", TODAY), 4);
  assert.equal(addDays(TODAY, 14), "2026-10-08");
  assert.equal(previousMonth("2026-01"), "2025-12");
});

// ------------------------------------------------------------------ sales

const lead = (over) => ({
  id: over.id,
  full_name: over.id,
  status: "potential",
  platform_source: "Facebook",
  created_at: "2026-09-10T10:00:00Z",
  registered_at: null,
  assigned_counselor_id: "c1",
  ...over,
});

test("registrations are counted in the Karachi month they happened", () => {
  const s = summarizeSales({
    leads: [
      lead({ id: "a", status: "registered", registered_at: "2026-08-31T20:00:00Z" }), // 1 Sep in Karachi
      lead({ id: "b", status: "registered", registered_at: "2026-08-15T10:00:00Z" }),
    ],
    calls: [],
    months: MONTHS,
    today: TODAY,
  });
  assert.equal(s.registeredThisMonth, 1);
  assert.equal(s.registeredLastMonth, 1);
  assert.deepEqual(
    s.monthly.map((m) => m.registered),
    [0, 1, 1]
  );
});

test("an open lead nobody has spoken to lately is due a call; one called yesterday is not", () => {
  const s = summarizeSales({
    leads: [
      lead({ id: "stale", created_at: "2026-09-01T10:00:00Z" }),
      lead({ id: "fresh", created_at: "2026-09-01T10:00:00Z" }),
      lead({ id: "parked", status: "next_intake", created_at: "2026-09-01T10:00:00Z" }),
      lead({ id: "lost", status: "not_interested", created_at: "2026-09-01T10:00:00Z" }),
    ],
    calls: [
      { lead_id: "stale", created_at: "2026-09-15T10:00:00Z" },
      { lead_id: "fresh", created_at: "2026-09-23T10:00:00Z" },
    ],
    months: MONTHS,
    today: TODAY,
  });
  assert.deepEqual(
    s.followUps.map((f) => [f.id, f.daysSince]),
    [["stale", 9]]
  );
  assert.ok(9 >= FOLLOW_UP_AFTER_DAYS);
  assert.equal(s.openLeads, 2);
  assert.equal(s.parkedLeads, 1, "parked is counted, not chased");
  assert.deepEqual(
    s.pipeline.map((p) => [p.status, p.count]),
    [
      ["potential", 2],
      ["next_intake", 1],
    ]
  );
});

test("conversion is measured over the last 90 days' leads, and small sources fold into Other", () => {
  const leads = [
    ...["Facebook", "Facebook", "Instagram", "Walk-in", "Referral", "Google", "TikTok", "Email"].map((src, i) =>
      lead({ id: `l${i}`, platform_source: src, registered_at: i < 2 ? "2026-09-12T10:00:00Z" : null, status: i < 2 ? "registered" : "potential" })
    ),
    lead({ id: "old", created_at: "2026-01-01T10:00:00Z", registered_at: "2026-02-01T10:00:00Z", status: "registered" }),
  ];
  const s = summarizeSales({ leads, calls: [], months: MONTHS, today: TODAY });
  assert.deepEqual(s.conversion, { received: 8, registered: 2, rate: 25 });
  assert.equal(s.sources.length, 6);
  assert.deepEqual(s.sources[0], { source: "Facebook", leads: 2, registered: 2 });
  assert.equal(s.sources.at(-1).source, "Other");
  assert.equal(
    s.sources.reduce((a, x) => a + x.leads, 0),
    8,
    "nothing lost in the folding"
  );
});

test("each step of the funnel sits inside the one before", () => {
  const s = summarizeSales({
    leads: [
      lead({ id: "new", status: "potential" }),
      lead({ id: "called", status: "potential" }),
      lead({ id: "busy", status: "busy" }),
      lead({ id: "met", status: "meeting_done" }),
      lead({ id: "won", status: "registered", registered_at: "2026-09-20T10:00:00Z" }),
    ],
    calls: [{ lead_id: "called", created_at: "2026-09-12T10:00:00Z" }],
    months: MONTHS,
    today: TODAY,
  });
  assert.deepEqual(
    s.funnel.map((f) => f.value),
    [5, 4, 2, 1]
  );
});

test("the leaderboard ranks by share of target, and counts only this month", () => {
  const rows = counselorLeaderboard(
    [
      { id: "c1", full_name: "Aisha", monthly_target: 4 },
      { id: "c2", full_name: "Bilal", monthly_target: 2 },
      { id: "c3", full_name: "Noor", monthly_target: null },
    ],
    [
      lead({ id: "1", assigned_counselor_id: "c1", status: "registered", registered_at: "2026-09-02T10:00:00Z" }),
      lead({ id: "2", assigned_counselor_id: "c2", status: "registered", registered_at: "2026-09-03T10:00:00Z" }),
      lead({ id: "3", assigned_counselor_id: "c2", status: "registered", registered_at: "2026-08-03T10:00:00Z" }),
      lead({ id: "4", assigned_counselor_id: "c3" }),
    ],
    "2026-09"
  );
  assert.deepEqual(
    rows.map((r) => [r.name, r.registered, r.pct]),
    [
      ["Bilal", 1, 50],
      ["Aisha", 1, 25],
      ["Noor", 0, null],
    ]
  );
  assert.equal(rows.find((r) => r.name === "Noor").open, 1);
});

// ------------------------------------------------------------- processing

const STAGES = [
  { key: "docs", label: "Admission Docs", type: "checkbox", options: ["Completed"] },
  { key: "visa", label: "Visa Status", type: "select", options: ["Granted", "Rejected"] },
];

test("processing counts only its own students, and lists only deadlines still to be met", () => {
  const s = summarizeProcessing({
    students: [
      { id: "s1", full_name: "Sara", processing_officer_id: "p1" },
      { id: "s2", full_name: "Omar", processing_officer_id: "p1" },
    ],
    applications: [
      { id: "a1", student_id: "s1", current_stage: "documents_pending", pipelineStages: ["documents_pending", "application_submitted"], deadline: "2026-10-01", universityName: "Bologna" },
      { id: "a2", student_id: "s2", current_stage: "application_submitted", pipelineStages: ["documents_pending", "application_submitted"], deadline: "2026-09-30", universityName: "Padova" },
      { id: "a3", student_id: "s1", current_stage: "documents_pending", pipelineStages: ["documents_pending"], deadline: "2026-12-01", universityName: "Far off" },
      { id: "x", student_id: "someone-else", current_stage: "documents_pending", pipelineStages: ["documents_pending"], deadline: "2026-09-25", universityName: "Not mine" },
    ],
    documents: [
      { id: "d1", student_id: "s1", status: "submitted", uploaded_at: "2026-09-14T10:00:00Z", verified_at: null },
      { id: "d2", student_id: "s2", status: "under_review", uploaded_at: "2026-09-20T10:00:00Z", verified_at: null },
      { id: "d3", student_id: "s1", status: "verified", uploaded_at: "2026-09-01T10:00:00Z", verified_at: "2026-09-05T10:00:00Z" },
      { id: "d4", student_id: "s2", status: "verified", uploaded_at: "2026-09-10T10:00:00Z", verified_at: "2026-09-12T10:00:00Z" },
    ],
    visas: [
      { studentId: "s1", decision: "approved", decidedAt: "2026-09-10T10:00:00Z" },
      { studentId: "s2", decision: "refused", decidedAt: "2026-08-10T10:00:00Z" },
      { studentId: "s2", decision: "pending", decidedAt: null },
    ],
    scholarships: [{ student_id: "s1", status: "submitted", application_deadline: "2026-10-10", name: "DSU" }],
    stages: [
      { studentId: "s1", destinationName: "Italy", stages: STAGES, values: { docs: "Completed" } },
      { studentId: "s2", destinationName: "Italy", stages: STAGES, values: { docs: "Completed", visa: "Rejected" } },
    ],
    months: MONTHS,
    today: TODAY,
  });
  assert.equal(s.students, 2);
  assert.deepEqual(
    s.deadlines.map((d) => [d.university, d.days]),
    [["Bologna", 7]],
    "a submitted application has met its deadline; one outside the fortnight waits"
  );
  assert.equal(s.docsWaiting, 2);
  assert.deepEqual(s.oldestWaiting[0], { studentId: "s1", studentName: "Sara", days: 10 });
  assert.equal(s.turnaroundDays, 3, "(4 + 2) / 2");
  assert.deepEqual(s.visaYear, { approved: 1, refused: 1, rate: 50 });
  assert.deepEqual(
    s.visaMonthly.map((m) => [m.approved, m.refused]),
    [
      [0, 0],
      [0, 1],
      [1, 0],
    ]
  );
  assert.equal(s.scholarshipDeadlines.length, 1);
  assert.equal(s.completeCount, 1, "every stage recorded — a refusal is still a recorded outcome");
  assert.deepEqual(s.stageMix, [{ label: "Visa Status", count: 1 }]);
  assert.deepEqual(
    s.outcomes.map((o) => [o.category, o.count]),
    [
      ["pending", 2],
      ["submitted", 1],
    ]
  );
});

test("the officer table groups unassigned students, and shows an officer with none", () => {
  const rows = officerTable({
    officers: [
      { id: "p1", full_name: "Hina" },
      { id: "p2", full_name: "Zain" },
    ],
    students: [
      { id: "s1", full_name: "A", processing_officer_id: "p1" },
      { id: "s2", full_name: "B", processing_officer_id: null },
    ],
    documents: [{ id: "d", student_id: "s2", status: "submitted", uploaded_at: null, verified_at: null }],
    visas: [{ studentId: "s1", decision: "approved", decidedAt: "2026-09-01T00:00:00Z" }],
    today: TODAY,
  });
  assert.deepEqual(
    rows.map((r) => [r.name, r.students, r.docsWaiting, r.rate]),
    [
      ["Hina", 1, 0, 100],
      ["Unassigned", 1, 1, null],
      ["Zain", 0, 0, null],
    ]
  );
});

// ---------------------------------------------------------------- finance

const inst = (over) => ({ amount: 1000, amount_paid: null, status: "unpaid", due_date: "2026-09-30", paid_date: null, currency: "EUR", studentId: "s", studentName: "S", ...over });

test("a part-paid instalment counts only what was paid", () => {
  assert.equal(paidOn({ amount: 1000, amount_paid: 300, status: "partial" }), 300);
  assert.equal(paidOn({ amount: 1000, amount_paid: null, status: "paid" }), 1000);
  assert.equal(paidOn({ amount: 1000, amount_paid: 999, status: "unpaid" }), 0);
});

test("money collected, owed and late, in the currency it came in and as ≈PKR", () => {
  const s = summarizeFinance({
    installments: [
      inst({ status: "paid", paid_date: "2026-09-05", due_date: "2026-09-05" }),
      inst({ status: "partial", amount_paid: 400, paid_date: "2026-09-10", due_date: "2026-08-01" }), // 54 days late, 600 left
      inst({ status: "unpaid", due_date: "2026-09-20", currency: "PKR", amount: 50000 }), // 4 days late
      inst({ status: "unpaid", due_date: "2026-10-10" }), // due soon
      inst({ status: "paid", paid_date: "2026-08-02", due_date: "2026-08-02", currency: "PKR", amount: 20000 }),
    ],
    refunds: [
      { status: "requested", amount: 100, currency: "EUR" },
      { status: "approved", amount: 200, currency: "EUR" },
      { status: "processed", amount: 300, currency: "EUR" },
    ],
    partnerCommissions: [
      { status: "received", expected_amount: 1000, paid_fee: null, currency: "EUR", received_date: "2026-09-02" },
      { status: "overdue", expected_amount: 1000, paid_fee: null, currency: "EUR", received_date: null },
      { status: "disputed", expected_amount: 5000, paid_fee: null, currency: "EUR", received_date: null },
    ],
    staffCommissions: [
      { status: "unpaid", amount: 5000, currency: "PKR" },
      { status: "paid", amount: 9000, currency: "PKR" },
    ],
    months: MONTHS,
    today: TODAY,
  });
  assert.deepEqual(s.collectedThisMonth, [{ currency: "EUR", amount: 1400 }]);
  assert.deepEqual(
    s.collectedMonthlyPkr.map((m) => m.pkr),
    [0, 20000, 1400 * 335]
  );
  assert.equal(s.overdueCount, 2);
  assert.deepEqual(
    s.overdue.map((o) => [o.days, o.remaining, o.currency]),
    [
      [54, 600, "EUR"],
      [4, 50000, "PKR"],
    ]
  );
  assert.equal(s.overduePkr, 600 * 335 + 50000);
  assert.deepEqual(
    s.aging.map((a) => a.pkr),
    [50000, 600 * 335, 0, 0]
  );
  assert.equal(s.dueSoonCount, 1);
  assert.equal(s.outstandingPkr, 600 * 335 + 50000 + 1000 * 335);
  assert.equal(s.dueThisMonthPkr, 1000 * 335 + 50000, "the two instalments due in September");
  assert.deepEqual(s.refunds, { toApprove: 1, toPay: 1, toPayPkr: 200 * 335 });
  assert.equal(s.partner.rate, 50, "a disputed commission is left out of both sides");
  assert.equal(s.partner.overdueCount, 1);
  assert.equal(s.staffCommissionUnpaidPkr, 5000);
});

// -------------------------------------------------------------- marketing

test("the social calendar: what is coming up, what was missed, and posting on time", () => {
  const s = summarizeSocial({
    posts: [
      { id: "1", theme: "Italy DSU", post_date: "2026-09-26", status: "in_design", platforms: ["Instagram"] },
      { id: "2", theme: "Germany", post_date: "2026-09-20", status: "approved", platforms: ["Facebook"] },
      { id: "3", theme: null, post_date: "2026-09-10", status: "posted", platforms: ["Instagram", "Facebook"] },
      { id: "4", theme: "Far", post_date: "2026-11-01", status: "brief_sent", platforms: [] },
    ],
    ads: [
      { id: "a", platform: "Meta", country: "Italy", planned_spend: 500, actual_spend: 300, start_date: "2026-09-01", end_date: null },
      { id: "b", platform: "Google", country: null, planned_spend: 200, actual_spend: 200, start_date: "2026-06-01", end_date: "2026-07-01" },
    ],
    months: MONTHS,
    today: TODAY,
  });
  assert.deepEqual(
    s.upcoming.map((u) => u.id),
    ["1"]
  );
  assert.deepEqual(
    s.missed.map((m) => m.id),
    ["2"]
  );
  assert.deepEqual(s.onTime, { due: 2, posted: 1, rate: 50 });
  assert.equal(s.upcomingCount, 1);
  assert.equal(s.missedCount, 1);
  assert.equal(s.postedMonthly.at(-1).count, 1);
  assert.equal(s.pipeline.find((p) => p.status === "in_design").count, 1);
  assert.equal(s.pipeline.find((p) => p.status === "brief_sent").count, 1);
  assert.deepEqual(
    s.ads.map((a) => a.name),
    ["Meta · Italy"],
    "only campaigns running today"
  );
  assert.equal(s.upcoming.length && s.missed[0].title, "Germany");
});

test("lead generation: a campaign's cost per lead and per registration", () => {
  const s = summarizeLeadGen({
    leads: [
      lead({ id: "1", created_at: "2026-09-02T10:00:00Z", registered_at: "2026-09-20T10:00:00Z", status: "registered" }),
      lead({ id: "2", created_at: "2026-09-03T10:00:00Z" }),
      lead({ id: "3", created_at: "2026-08-03T10:00:00Z", assigned_counselor_id: null }),
    ],
    campaigns: [
      { id: "c", name: "Expo", type: "event", event_date_start: "2026-10-05", actual_spend: 1000, budget: 1500 },
      { id: "d", name: "Quiet", type: "digital", event_date_start: null, actual_spend: null, budget: null },
    ],
    leadCampaign: new Map([
      ["1", "c"],
      ["2", "c"],
    ]),
    referrals: [
      { incentive_status: "owed", incentive_owed: 2000, currency: "PKR" },
      { incentive_status: "paid", incentive_owed: 9000, currency: "PKR" },
    ],
    months: MONTHS,
    today: TODAY,
  });
  assert.deepEqual(s.campaigns, [{ id: "c", name: "Expo", leads: 2, registered: 1, spend: 1000, costPerLead: 500, costPerRegistration: 1000 }]);
  assert.equal(s.leadsThisMonth, 2);
  assert.equal(s.leadsLastMonth, 1);
  assert.equal(s.unassigned, 1);
  assert.deepEqual(s.upcomingEvents, [{ id: "c", name: "Expo", date: "2026-10-05" }]);
  assert.equal(s.upcomingEventCount, 1);
  assert.deepEqual(s.referralsOwed, { count: 1, amount: 2000 });
  assert.deepEqual(
    s.monthly.map((m) => [m.leads, m.registered]),
    [
      [0, 0],
      [1, 0],
      [2, 1],
    ]
  );
});

// ------------------------------------------------------------------ views

import { pickView, viewsFor } from "../src/lib/dashboards/views.ts";

test("each job gets its own dashboard; several roles get a tab each, the main role's first", () => {
  assert.deepEqual(viewsFor({ role: "counselor", roles: ["counselor"] }), ["sales"]);
  assert.deepEqual(viewsFor({ role: "digital_marketing", roles: ["digital_marketing"] }), ["social"]);
  assert.deepEqual(viewsFor({ role: "processing", roles: ["processing", "counselor"] }), ["processing", "sales"]);
  assert.deepEqual(viewsFor({ role: "counselor", roles: ["processing", "counselor"] }), ["sales", "processing"]);
  assert.deepEqual(viewsFor({ role: "management", roles: ["management"] }), ["overview", "finance", "leadgen", "social", "sales_team", "processing_team"]);
  assert.deepEqual(viewsFor({ role: "finance" }), ["finance"], "the primary role alone still counts");
  assert.deepEqual(viewsFor(null), []);
});

test("a view asked for in the address is shown only if it is theirs", () => {
  assert.equal(pickView(["sales"], "finance"), "sales");
  assert.equal(pickView(["sales", "processing"], "processing"), "processing");
  assert.equal(pickView([], "sales"), null);
});

// ---------------------------------------------------------------- partner

import { summarizePartner } from "../src/lib/dashboards/partner.ts";

test("a university sees its referrals as a funnel, and what waits on its decision", () => {
  const PIPE = ["documents_pending", "documents_verified", "application_submitted", "under_review", "conditional_offer_received", "enrolled"];
  const app = (id, stage, submitted = "2026-09-01T10:00:00Z") => ({ application_id: id, student_name: `S${id}`, program_name: "MSc", current_stage: stage, pipeline_stages: PIPE, submitted_at: submitted });
  const s = summarizePartner({
    apps: [
      app("1", "documents_pending"),
      app("2", "under_review", "2026-09-04T10:00:00Z"),
      app("3", "application_submitted", "2026-08-25T10:00:00Z"),
      app("4", "conditional_offer_received"),
      app("5", "enrolled"),
      app("6", "rejected"),
    ],
    commissions: [
      { status: "received", expected_amount: 1000, currency: "EUR" },
      { status: "overdue", expected_amount: 500, currency: "EUR" },
      { status: "disputed", expected_amount: 9000, currency: "EUR" },
    ],
    today: TODAY,
  });
  assert.deepEqual(
    s.funnel.map((f) => f.value),
    [6, 5, 2, 1]
  );
  assert.equal(s.offerRate, 67, "2 offers of 3 decided");
  assert.equal(s.inProgress, 3);
  assert.equal(s.awaitingCount, 2);
  assert.deepEqual(
    s.awaitingDecision.map((a) => [a.id, a.days]),
    [
      ["3", 30],
      ["2", 20],
    ]
  );
  assert.deepEqual(s.commissions, { total: 2, received: 1, overdue: 1, byCurrency: [{ currency: "EUR", expected: 1500, received: 1000 }] });
});
