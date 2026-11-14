// Receipts from universities (0365, 0366): what they are called, where their
// files live, and how many may go up at once. One requirement per application,
// in the "Receipts - Universities" section of the student's documents, listed
// under the university's name; its files under
// <student>/fee-receipts/<application>/ — a folder the student may read only
// once the receipts are shown to them, and never write.
//
// No portal imports, so the unit tests load it under plain Node.

export const FEE_RECEIPT_CATEGORY = "application_fee";
export const FEE_RECEIPT_NAME = "Application fee receipt";
/** The section's name, as 0366 set it; Setup may rename it, so the page reads the label from document_sections. */
export const FEE_RECEIPT_SECTION_LABEL = "Receipts - Universities";
/** Chosen together, uploaded together, each kept as its own file. */
export const MAX_FEE_RECEIPTS_AT_ONCE = 10;

/** An application's receipts are listed under its university's name. */
export function receiptEntryName(universityName: string | null | undefined, fallback: string): string {
  return universityName?.trim() || fallback;
}

/** A receipt, an invoice or a fee paid — said of a name typed for a document, to file it with the receipts. */
export function looksLikeReceipt(name: string): boolean {
  return /\b(rec+e?i?e?pts?|invoices?|ricevut[ae]|fattur[ae]|quietanza|payments?|paid|pagamento)\b/i.test(name);
}

/** Where one receipt file is stored. */
export function feeReceiptPath(studentId: string, applicationId: string, safeName: string, tag: string): string {
  return `${studentId}/fee-receipts/${applicationId}/${tag}/${safeName}`;
}

/** Whether a stored path is a fee receipt's — the folder the student cannot reach until it is shown. */
export function isFeeReceiptPath(path: string | null | undefined): boolean {
  return /^[0-9a-f-]{36}\/fee-receipts\/[0-9a-f-]{36}\//.test(String(path ?? ""));
}
