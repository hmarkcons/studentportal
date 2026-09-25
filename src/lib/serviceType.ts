// What HMARK is doing for a student: the full service — admission and visa —
// or visa documentation and application only, for a client who already holds
// an admission letter (0279, leads.service_type).
//
// A visa-only student skips the admission work: processing records the
// admission they already have and uploads the letter, the admission stages
// are marked done, the admission documents are not asked for, and the visa
// work carries on as for anyone else. Their agreement is a visa-service one,
// and their invoice charges the visa service fee alone — no administrative
// charge, no consultancy fee.
//
// Only a Super Admin or processing may set it; the database holds that too.
//
// Pure, so it is unit-tested (scripts/service-type-test.mjs).

import { hasRole } from "./auth/roles.ts";
import type { DashboardStageDef, DashboardStageValues } from "./dashboardPipeline.ts";

export const SERVICE_TYPES = ["full", "visa_only"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  full: "Full service (admission and visa)",
  visa_only: "Visa documentation & application only",
};

/** For a badge or a list: short enough to sit beside a name. */
export const SERVICE_SHORT: Record<ServiceType, string> = {
  full: "Full service",
  visa_only: "Visa service only",
};

/** What the fee is called on an agreement or invoice for this service. */
export const SERVICE_FEE_NAME: Record<ServiceType, string> = {
  full: "Consultancy fee",
  visa_only: "Visa documentation & application",
};

/** The same, as the PDF prints it — title case, like its other rows. */
export const SERVICE_FEE_TITLE: Record<ServiceType, string> = {
  full: "Consultancy Fee",
  visa_only: "Visa Documentation & Application Fee",
};

/**
 * The terms a visa-only invoice opens on. The full service refunds the
 * consultancy fee only on a refusal from the university, and never on an
 * embassy rejection; a visa-only client has no university refusal to come,
 * so what is left of that rule is that the fee is not refunded. Staff can
 * edit it on the invoice.
 */
export const VISA_INVOICE_TERMS =
  "The visa documentation and application fee is non-refundable. There is no refund on rejection or refusal from the embassy, on withdrawal, or under any other condition.";

export function isServiceType(v: unknown): v is ServiceType {
  return typeof v === "string" && (SERVICE_TYPES as readonly string[]).includes(v);
}

/** The service a stored value names, reading anything unknown or missing as the full service. */
export function serviceOf(v: unknown): ServiceType {
  return isServiceType(v) ? v : "full";
}

/** May set or change a student's service: Super Admin and processing. */
export function canSetService(staff: Parameters<typeof hasRole>[0]): boolean {
  return hasRole(staff, "super_admin", "processing");
}

/**
 * The country stages that are admission work — the standard first three
 * (reference/Destination Pipeline Stages.txt, seeded by 0101). A visa-only
 * student already has their admission, so these are recorded as done.
 * Country-specific steps after them (tuition fee, CAS, blocked account) stay
 * for processing to record, because an admission letter does not settle them.
 */
export const ADMISSION_STAGE_KEYS = ["admission_docs", "admission", "university_and_program"] as const;

/** The document checklist section that is admission work, left off a visa-only student's checklist. */
export const ADMISSION_DOCUMENT_SECTION = "admission";

const DONE_OPTION = /issued|granted|received|complete|finali[sz]ed|done|accepted|yes/i;

/** What "done" is for one stage: its single option, the option that means done, or today's date. */
export function admissionDoneValue(stage: DashboardStageDef, today: string): string {
  if (stage.type === "date") return today;
  const options = stage.options ?? [];
  if (stage.type === "checkbox") return options[0] || "Completed";
  return options.find((o) => DONE_OPTION.test(o)) ?? options[options.length - 1] ?? "Completed";
}

/**
 * A destination's stage values with the admission stages filled in as done,
 * leaving anything already recorded exactly as it was. `changed` is false
 * when there was nothing to fill.
 */
export function withAdmissionStagesDone(
  stages: DashboardStageDef[],
  values: DashboardStageValues,
  today: string
): { values: DashboardStageValues; changed: boolean } {
  const next = { ...values };
  let changed = false;
  for (const stage of stages) {
    if (!(ADMISSION_STAGE_KEYS as readonly string[]).includes(stage.key)) continue;
    if (next[stage.key]) continue;
    next[stage.key] = admissionDoneValue(stage, today);
    changed = true;
  }
  return { values: next, changed };
}

/**
 * Where an application stands once the admission letter is in hand: the
 * destination's "offer accepted" stage where it has one, otherwise the first
 * stage after "under review" (the decision), otherwise its last stage. Either
 * way categorizeApplicationStage reads it as having an offer.
 */
export function admittedStage(pipelineStages: string[]): string | null {
  if (pipelineStages.length === 0) return null;
  if (pipelineStages.includes("offer_accepted")) return "offer_accepted";
  const review = pipelineStages.indexOf("under_review");
  if (review !== -1 && review < pipelineStages.length - 1) return pipelineStages[review + 1];
  return pipelineStages[pipelineStages.length - 1];
}

/** The agreement templates for this student's service — a visa-only student gets visa-service templates only. */
export function templatesForService<T extends { service_type?: string | null }>(templates: T[], service: ServiceType): T[] {
  return templates.filter((t) => serviceOf(t.service_type) === service);
}

/** Why this template cannot be used for this student's service, or null. */
export function templateServiceError(templateService: unknown, studentService: ServiceType): string | null {
  if (serviceOf(templateService) === studentService) return null;
  return studentService === "visa_only"
    ? "This student is registered for the visa service only — choose a visa-service template."
    : "That is a visa-service template, and this student is registered for the full service.";
}
