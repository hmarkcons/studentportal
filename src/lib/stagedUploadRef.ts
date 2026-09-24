// The reference a form posts in place of a file it has already put into
// storage (0275). Built in the browser, read by the server action.
//
//   staged:<bucket>:<user id>/<timestamp>-<random>-<safe name>:<original name>
//
// The server trusts none of it: the bucket must be one of the two staging
// buckets (the video one only where a video is expected), the folder must be
// the signed-in person's own, and the path must have exactly the shape built
// here. Storage's own policies then refuse anything else anyway — this is so
// a bad reference is a clear sentence rather than a storage error.
//
// Pure, so it is unit-tested (scripts/staged-upload-ref-test.mjs).

export const STAGING_BUCKET = "upload-staging";
export const STAGING_VIDEO_BUCKET = "upload-staging-video";

/** How long a staged file is kept if nothing claims it. */
export const STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PREFIX = "staged:";

/** A name safe as the last part of a storage key; the original travels in the reference. */
export function safeStagingName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-80);
  return cleaned || "file";
}

export function stagingPath(userId: string, fileName: string, now: number, random: string): string {
  return `${userId}/${now}-${random}-${safeStagingName(fileName)}`;
}

export function makeStagedRef(bucket: string, path: string, originalName: string): string {
  return `${PREFIX}${bucket}:${path}:${encodeURIComponent(originalName)}`;
}

export function isStagedRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export type StagedRef = { bucket: string; path: string; fileName: string; stagedAt: number };

/**
 * The staged file a reference names, or why it cannot be used.
 *
 * `allowVideo` is off except for the consent video, so a document field can
 * never be satisfied with something from the 40 MB bucket.
 */
export function parseStagedRef(
  value: string,
  userId: string,
  { allowVideo = false }: { allowVideo?: boolean } = {}
): StagedRef | { error: string } {
  const bad = { error: "That upload could not be found. Choose the file again." };
  if (!isStagedRef(value)) return bad;
  const rest = value.slice(PREFIX.length);
  const firstColon = rest.indexOf(":");
  const lastColon = rest.lastIndexOf(":");
  if (firstColon <= 0 || lastColon <= firstColon) return bad;

  const bucket = rest.slice(0, firstColon);
  const path = rest.slice(firstColon + 1, lastColon);
  let fileName: string;
  try {
    fileName = decodeURIComponent(rest.slice(lastColon + 1));
  } catch {
    return bad;
  }

  const buckets = allowVideo ? [STAGING_BUCKET, STAGING_VIDEO_BUCKET] : [STAGING_BUCKET];
  if (!buckets.includes(bucket)) return bad;

  const parts = path.split("/");
  if (parts.length !== 2 || parts[0] !== userId) return bad;
  const m = /^(\d{13})-[A-Za-z0-9]{6,32}-[A-Za-z0-9._-]{1,80}$/.exec(parts[1]);
  if (!m) return bad;

  return { bucket, path, fileName: fileName.trim() || "file", stagedAt: Number(m[1]) };
}

/** When a staged file was put there, from its name — or null if it is not one of ours. */
export function stagedAtFromName(name: string): number | null {
  const m = /^(\d{13})-/.exec(name);
  return m ? Number(m[1]) : null;
}
