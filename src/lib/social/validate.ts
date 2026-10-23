// Per-platform post validation, driven by PLATFORM_LIMITS. Pure, so the composer
// (live, per selected platform) and the server (before scheduling/publishing)
// run exactly the same checks, and the unit tests read it directly.

import { PLATFORM_LIMITS } from "./limits.ts";
import { PLATFORM_LABELS, type SocialPlatform } from "./types.ts";

export type DraftMedia = { kind: "image" | "video"; sizeBytes?: number | null };

export type PostDraft = {
  /** The caption that will actually go out (per-platform override, else the base). */
  caption: string;
  link: string | null;
  media: DraftMedia[];
  /** Per-platform options: { igType, privacy, destination, ... }. */
  options: Record<string, unknown>;
};

export function draftMediaKind(media: DraftMedia[]): "image" | "video" | "mixed" | "none" {
  if (media.length === 0) return "none";
  const hasVideo = media.some((m) => m.kind === "video");
  const hasImage = media.some((m) => m.kind === "image");
  if (hasVideo && hasImage) return "mixed";
  return hasVideo ? "video" : "image";
}

/** The problems that would stop this draft publishing to `platform` — empty if it's fine. */
export function validateForPlatform(platform: SocialPlatform, d: PostDraft): string[] {
  const L = PLATFORM_LIMITS[platform];
  const name = PLATFORM_LABELS[platform];
  const errors: string[] = [];
  const kind = draftMediaKind(d.media);
  const hasMedia = kind !== "none";

  if (L.captionMax != null && d.caption.length > L.captionMax) {
    errors.push(`${name}: caption is ${d.caption.length}/${L.captionMax} characters — too long.`);
  }

  if (L.mediaRequired && !hasMedia) {
    errors.push(`${name} needs an image or video — it can't post text only.`);
  } else if (!L.textOnlyAllowed && !hasMedia) {
    errors.push(`${name} can't post text only — add media.`);
  }
  if (!hasMedia && !d.caption.trim() && !d.link) {
    errors.push(`${name}: add a caption, media or a link.`);
  }

  if (kind === "mixed") {
    errors.push(`${name}: a post is either images or one video, not both.`);
  }

  if (kind === "image") {
    if (L.image.maxCount == null) errors.push(`${name} doesn't support image posts.`);
    else if (d.media.length > L.image.maxCount) errors.push(`${name}: up to ${L.image.maxCount} image${L.image.maxCount === 1 ? "" : "s"} (you have ${d.media.length}).`);
    if (L.image.maxBytes != null) {
      const tooBig = d.media.find((m) => m.kind === "image" && (m.sizeBytes ?? 0) > L.image.maxBytes!);
      if (tooBig) errors.push(`${name}: an image is over the ${Math.round(L.image.maxBytes / (1024 * 1024))} MB limit.`);
    }
  }

  if (kind === "video") {
    if (L.video.maxCount == null) errors.push(`${name} doesn't support video.`);
    else if (d.media.length > L.video.maxCount) errors.push(`${name}: one video per post.`);
    if (L.video.maxBytes != null) {
      const tooBig = d.media.find((m) => m.kind === "video" && (m.sizeBytes ?? 0) > L.video.maxBytes!);
      if (tooBig) errors.push(`${name}: the video is over the ${Math.round(L.video.maxBytes / (1024 * 1024))} MB limit.`);
    }
  }

  if (L.requires.instagramPostType && !d.options.igType) errors.push(`${name}: choose feed, reel or story.`);
  if (L.requires.tiktokDisclosure && !d.options.privacy) errors.push(`${name}: choose a privacy level.`);
  if (L.requires.snapchatDestination && !d.options.destination) errors.push(`${name}: choose a destination (Story, Saved Story or Spotlight).`);

  return errors;
}
