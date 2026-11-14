// Application fee receipts (0365): what they are called, where their files
// live, and how many may go up at once. One requirement per application, in
// the "Application Fee" section of the student's documents; its files under
// <student>/fee-receipts/<application>/ — a folder the student may read only
// once the receipts are shown to them, and never write.
//
// No portal imports, so the unit tests load it under plain Node.

export const FEE_RECEIPT_CATEGORY = "application_fee";
export const FEE_RECEIPT_NAME = "Application fee receipt";
/** Chosen together, uploaded together, each kept as its own file. */
export const MAX_FEE_RECEIPTS_AT_ONCE = 10;

/** Where one receipt file is stored. */
export function feeReceiptPath(studentId: string, applicationId: string, safeName: string, tag: string): string {
  return `${studentId}/fee-receipts/${applicationId}/${tag}/${safeName}`;
}

/** Whether a stored path is a fee receipt's — the folder the student cannot reach until it is shown. */
export function isFeeReceiptPath(path: string | null | undefined): boolean {
  return /^[0-9a-f-]{36}\/fee-receipts\/[0-9a-f-]{36}\//.test(String(path ?? ""));
}
