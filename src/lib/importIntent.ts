// Preview or apply — and, on apply, whether it is the preview that was shown.
//
// Every previewed import (the catalogue's three sheets, the scholarship
// bodies) runs twice: once with `intent=preview`, writing nothing, and once
// with `intent=apply` carrying the fingerprint the preview answered with. The
// fingerprint covers the file's bytes and anything else in the form that
// changes the outcome, so a sheet swapped — or a setting changed — after the
// preview is refused rather than written without ever having been shown.
//
// Moved here from src/lib/actions/universities.ts, unchanged, so that a
// second import does not grow a second copy of the one check that makes a
// preview mean something. A "use server" file may only export async
// functions, which is why it could not simply be exported from there.
//
// Free of `@/` imports, like the other pure import modules.

import { createHash } from "node:crypto";

/** sha256 of the uploaded bytes, as hex. */
export function fileDigest(bytes: ArrayBuffer | Uint8Array): string {
  return createHash("sha256")
    .update(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .digest("hex");
}

/**
 * Preview unless the form says apply; apply only when the fingerprint it sends
 * back is the one this file and context produce now.
 *
 * `notPreviewed` is what the refusal says, since only the caller knows what
 * besides the file could have changed.
 */
export function importIntent(
  formData: FormData,
  digest: string,
  context: readonly string[],
  notPreviewed: string
): { dryRun: boolean; fingerprint: string } | { error: string } {
  const fingerprint = createHash("sha256")
    .update([digest, ...context].join("|"))
    .digest("hex")
    .slice(0, 32);
  if (formData.get("intent") !== "apply") return { dryRun: true, fingerprint };
  if (String(formData.get("fingerprint") ?? "") !== fingerprint) return { error: notPreviewed };
  return { dryRun: false, fingerprint };
}
