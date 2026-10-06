// What each column of the applications table says about an application, as
// plain text: what the table searches and filters on, and what the Excel
// export writes. Pure, so the table (a client component) and the export route
// share it.

import type { ApplicationRow } from "@/lib/applicationRows";
import { stageGroup, stageLabel, type ApplicationColumnKey, type StageGroup } from "@/lib/applicationTable";
import { formatFee } from "@/lib/applicationFee";

export function applicationCellText(r: ApplicationRow, key: ApplicationColumnKey): string {
  switch (key) {
    case "student":
      return r.studentName;
    case "student_code":
      return r.studentCode ?? "";
    case "priority":
      return String(r.number);
    case "country":
      return r.country ?? "";
    case "university":
      return r.universityName;
    case "city":
      return r.city ?? "";
    case "program":
      return r.programName ?? "";
    case "level":
      return r.level ?? "";
    case "intake":
      return r.intake ?? "";
    case "round":
      return r.roundLabel ?? "";
    case "deadline":
      return r.deadline ?? "";
    case "stage":
      return stageLabel(r.stage);
    case "fee":
      return r.fee ? formatFee(r.fee, r.feeCurrency) : "";
    case "requirements":
      return r.requirements ?? "";
    case "finalized":
      return r.finalized ? r.finalizedBadge || "Finalized for visa" : "";
    case "remark":
      return r.remark ?? "";
    case "tasks":
      return r.tasksTotal ? `${r.tasksOpen} open of ${r.tasksTotal}` : "";
    case "counselor":
      return r.counselorName ?? "";
    case "officer":
      return r.officerName ?? "";
    case "portal_link":
      return r.portalLink ?? "";
    case "page_link":
      return r.pageLink ?? "";
    case "requirements_link":
      return r.requirementsLink ?? "";
    case "coordinator_email":
      return r.coordinatorEmail ?? "";
    case "university_email":
      return r.universityEmail ?? "";
    case "updated":
      return r.updatedAt.slice(0, 10);
  }
}

/** Where a row stands — offer or later, in progress, closed, rejected. */
export function applicationGroup(r: Pick<ApplicationRow, "stage" | "pipeline">): StageGroup {
  return stageGroup(r.stage, r.pipeline);
}
