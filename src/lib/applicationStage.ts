// Destination pipelines are configurable per-destination (project scope doc)
// so stage NAMES vary a lot beyond the first few steps (e.g. "acceptance_letter"
// vs "conditional_offer_received" vs "coe" all mean roughly the same thing:
// an offer/acceptance has been received). But every real destination's
// pipeline_stages currently starts with the same 4 stages in the same
// order — documents_pending, documents_verified, application_submitted,
// under_review — before diverging. That consistent prefix is what this
// categorization leans on to stay destination-agnostic instead of matching
// specific stage names.
export type ApplicationStageCategory = "pending" | "submitted" | "with_offer" | "rejected" | "not_eligible" | "withdrawn";

export function categorizeApplicationStage(currentStage: string, pipelineStages: string[]): ApplicationStageCategory {
  if (currentStage === "rejected") return "rejected";
  if (currentStage === "declined") return "not_eligible";
  if (currentStage === "withdrawn") return "withdrawn";

  const idx = pipelineStages.indexOf(currentStage);
  const underReviewIdx = pipelineStages.indexOf("under_review");
  const submittedIdx = pipelineStages.indexOf("application_submitted");

  if (underReviewIdx !== -1 && idx > underReviewIdx) return "with_offer";
  if (submittedIdx !== -1 && idx >= submittedIdx) return "submitted";
  return "pending";
}
