export const STALL_THRESHOLD_DAYS = 7;

export function daysSince(dateStr: string) {
  return (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
}

export function isStalled(updatedAt: string, currentStage: string) {
  if (currentStage === "enrollment") return false;
  return daysSince(updatedAt) >= STALL_THRESHOLD_DAYS;
}
