// Inventory quantities and request statuses.
//
// The quantity rules live here rather than only in the database because a
// constraint violation reaches the user as "new row for relation
// inventory_requests violates check constraint ..." — true, and useless. The
// constraints are still the thing that actually holds (see migration 0150);
// these produce a sentence for the person who typed the number.

export const INVENTORY_REQUEST_STATUSES = ["pending", "fulfilled", "rejected"] as const;

export type InventoryRequestStatus = (typeof INVENTORY_REQUEST_STATUSES)[number];

export const INVENTORY_REQUEST_STATUS_LABELS: Record<InventoryRequestStatus, string> = {
  pending: "Awaiting decision",
  fulfilled: "Fulfilled",
  rejected: "Rejected",
};

export const INVENTORY_REQUEST_STATUS_TONE: Record<InventoryRequestStatus, "success" | "warning" | "danger"> = {
  pending: "warning",
  fulfilled: "success",
  rejected: "danger",
};

export function inventoryRequestStatusLabel(value: string): string {
  return (INVENTORY_REQUEST_STATUS_LABELS as Record<string, string>)[value] ?? value;
}

/**
 * Validates a requested quantity. A negative one used to be accepted — the
 * form's min="1" is a browser attribute and the action only rejected falsy
 * values, so -5 went through and fulfilling it ADDED five to stock.
 */
export function requestQuantityError(raw: FormDataEntryValue | string | null | undefined): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "Enter how many are needed.";
  const n = Number(text);
  if (!Number.isFinite(n)) return "That quantity is not a number.";
  if (n <= 0) return "A request has to be for at least one — a negative quantity would add to stock when it was fulfilled.";
  if (!Number.isInteger(n)) return "Request a whole number of units.";
  return null;
}

/**
 * Validates a stock figure. Nothing physical can be present in negative
 * quantity, and a low-stock badge computed from a negative figure means
 * nothing.
 */
export function stockQuantityError(raw: FormDataEntryValue | string | null | undefined): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null; // Absent means zero, which the column defaults to.
  const n = Number(text);
  if (!Number.isFinite(n)) return "The quantity on hand is not a number.";
  if (n < 0) return "The quantity on hand cannot be negative.";
  return null;
}

/**
 * Validates a low-stock threshold. Negative is not a stricter threshold, it is
 * an unreachable one: the badge fires on quantity <= threshold, so a negative
 * value silently means "never warn me". One item was on file set to -1, which
 * is why blank is the way to say that and a negative is refused.
 */
export function thresholdError(raw: FormDataEntryValue | string | null | undefined): string | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null; // Blank is how "don't warn me about this one" is said.
  const n = Number(text);
  if (!Number.isFinite(n)) return "The low-stock threshold is not a number.";
  if (n < 0) {
    return "A negative threshold could never be reached, so it would never warn you. Leave it blank to turn the warning off.";
  }
  return null;
}

/** True when an item should be flagged low. Blank threshold means never. */
export function isLowStock(quantityOnHand: number, threshold: number | null): boolean {
  if (threshold === null || threshold === undefined) return false;
  return quantityOnHand <= threshold;
}
