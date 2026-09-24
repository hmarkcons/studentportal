// The university partner's dashboard: the students HMARK has referred to
// them and where each application stands, what waits on the university's
// decision, and the commission on the students who enrolled. Pure —
// scripts/dashboards-test.mjs.

import { categorizeApplicationStage, type ApplicationStageCategory } from "../applicationStage.ts";
import { percentOf } from "../chartMath.ts";
import { daysBetween, karachiDay } from "./dates.ts";

export type PartnerApp = {
  application_id: string;
  student_name: string;
  program_name: string | null;
  current_stage: string;
  pipeline_stages: string[] | null;
  submitted_at: string;
};
export type PartnerCommission = { status: string | null; expected_amount: number | string | null; currency: string | null };

export type PartnerSummary = {
  referred: number;
  inProgress: number;
  offers: number;
  enrolled: number;
  rejected: number;
  /** Offers among the applications the university has decided. */
  offerRate: number | null;
  /** Each step inside the one before: an enrolled student had an offer, an offer followed a submission. */
  funnel: { label: string; value: number }[];
  outcomes: { key: ApplicationStageCategory; label: string; count: number }[];
  /** How many are submitted and not yet decided — all of them, not just the list. */
  awaitingCount: number;
  /** The longest-waiting of those, up to ten. */
  awaitingDecision: { id: string; label: string; days: number }[];
  commissions: { total: number; received: number; overdue: number; byCurrency: { currency: string; expected: number; received: number }[] };
};

const LABELS: Record<ApplicationStageCategory, string> = {
  pending: "Being prepared",
  submitted: "Awaiting your decision",
  with_offer: "Offer made",
  rejected: "Rejected",
  not_eligible: "Not eligible",
  withdrawn: "Withdrawn",
};

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function summarizePartner({ apps, commissions, today }: { apps: PartnerApp[]; commissions: PartnerCommission[]; today: string }): PartnerSummary {
  const counts = new Map<ApplicationStageCategory, number>();
  const awaiting: PartnerSummary["awaitingDecision"] = [];
  let enrolled = 0;
  for (const a of apps) {
    const cat = categorizeApplicationStage(a.current_stage, a.pipeline_stages ?? []);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
    if (a.current_stage === "enrolled") enrolled++;
    if (cat === "submitted") {
      awaiting.push({
        id: a.application_id,
        label: `${a.student_name}${a.program_name ? ` · ${a.program_name}` : ""}`,
        days: Math.max(0, daysBetween(karachiDay(a.submitted_at), today)),
      });
    }
  }
  awaiting.sort((a, b) => b.days - a.days || a.label.localeCompare(b.label));

  const c = (k: ApplicationStageCategory) => counts.get(k) ?? 0;
  const offers = c("with_offer");
  const rejected = c("rejected") + c("not_eligible");

  const byCurrency = new Map<string, { expected: number; received: number }>();
  let received = 0;
  let overdue = 0;
  for (const m of commissions) {
    if (m.status === "disputed") continue;
    const cur = m.currency || "EUR";
    const row = byCurrency.get(cur) ?? { expected: 0, received: 0 };
    row.expected += num(m.expected_amount);
    if (m.status === "received") {
      row.received += num(m.expected_amount);
      received++;
    }
    if (m.status === "overdue") overdue++;
    byCurrency.set(cur, row);
  }

  return {
    referred: apps.length,
    inProgress: c("pending") + c("submitted"),
    offers,
    enrolled,
    rejected,
    offerRate: percentOf(offers, offers + rejected),
    funnel: [
      { label: "Referred", value: apps.length },
      { label: "Submitted", value: c("submitted") + offers + rejected },
      { label: "Offer made", value: offers },
      { label: "Enrolled", value: enrolled },
    ],
    outcomes: (Object.keys(LABELS) as ApplicationStageCategory[]).map((key) => ({ key, label: LABELS[key], count: c(key) })).filter((o) => o.count > 0),
    awaitingCount: awaiting.length,
    awaitingDecision: awaiting.slice(0, 10),
    commissions: {
      total: commissions.filter((m) => m.status !== "disputed").length,
      received,
      overdue,
      byCurrency: [...byCurrency.entries()].map(([currency, v]) => ({ currency, ...v })).sort((a, b) => b.expected - a.expected),
    },
  };
}
