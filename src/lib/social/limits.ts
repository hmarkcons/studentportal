// Per-platform posting rules, in ONE place so they are easy to update when a
// platform changes them. Values reflect the official docs at build time; the
// exact current numbers should be re-checked against each platform's docs
// (noted per platform). The composer reads these for its counters and checks.

import type { SocialPlatform } from "./types.ts";

export type MediaRule = {
  /** null = not supported. */
  maxCount: number | null;
  maxBytes: number | null;
  /** Longest video in seconds, or null for images / not applicable. */
  maxDurationSeconds: number | null;
  /** Whether portrait/vertical (9:16) is required, preferred, or unconstrained. */
  vertical: "required" | "preferred" | null;
};

export type PlatformLimits = {
  /** Longest caption in characters, or null for effectively unlimited. */
  captionMax: number | null;
  /** May a post be text with no media? */
  textOnlyAllowed: boolean;
  /** Must a post include media? */
  mediaRequired: boolean;
  image: MediaRule;
  video: MediaRule;
  /** Extra required choices the composer must collect. */
  requires: {
    /** TikTok: privacy level + commercial-content disclosure are mandatory. */
    tiktokDisclosure?: boolean;
    /** Snapchat: a destination (Story / Saved Story / Spotlight). */
    snapchatDestination?: boolean;
    /** Instagram: post type (feed / reel / story). */
    instagramPostType?: boolean;
  };
  /** Human note shown in the composer / docs. */
  note: string;
};

const MB = 1024 * 1024;

export const PLATFORM_LIMITS: Record<SocialPlatform, PlatformLimits> = {
  // developers.facebook.com/docs/pages / graph-api
  facebook: {
    captionMax: 63206,
    textOnlyAllowed: true,
    mediaRequired: false,
    image: { maxCount: 10, maxBytes: 10 * MB, maxDurationSeconds: null, vertical: null },
    video: { maxCount: 1, maxBytes: 4 * 1024 * MB, maxDurationSeconds: 240 * 60, vertical: null },
    requires: {},
    note: "Text, link, image, multi-image, video or Reel.",
  },
  // developers.facebook.com/docs/instagram-platform/content-publishing
  instagram: {
    captionMax: 2200,
    textOnlyAllowed: false,
    mediaRequired: true,
    image: { maxCount: 10, maxBytes: 8 * MB, maxDurationSeconds: null, vertical: null },
    video: { maxCount: 1, maxBytes: 1024 * MB, maxDurationSeconds: 90, vertical: "required" },
    requires: { instagramPostType: true },
    note: "Media required (no text-only). Reels must be vertical video; carousels up to 10 items.",
  },
  // developers.facebook.com/docs/threads
  threads: {
    captionMax: 500,
    textOnlyAllowed: true,
    mediaRequired: false,
    image: { maxCount: 20, maxBytes: 8 * MB, maxDurationSeconds: null, vertical: null },
    video: { maxCount: 1, maxBytes: 1024 * MB, maxDurationSeconds: 300, vertical: null },
    requires: {},
    note: "Caption up to ~500 characters; text-only allowed.",
  },
  // learn.microsoft.com/linkedin / Community Management Posts API
  linkedin: {
    captionMax: 3000,
    textOnlyAllowed: true,
    mediaRequired: false,
    image: { maxCount: 9, maxBytes: 100 * MB, maxDurationSeconds: null, vertical: null },
    video: { maxCount: 1, maxBytes: 500 * MB, maxDurationSeconds: 30 * 60, vertical: null },
    requires: {},
    note: "Text, image, multi-image or video; longer captions allowed.",
  },
  // developers.tiktok.com/doc/content-posting-api
  tiktok: {
    captionMax: 2200,
    textOnlyAllowed: false,
    mediaRequired: true,
    image: { maxCount: 35, maxBytes: 20 * MB, maxDurationSeconds: null, vertical: "preferred" },
    video: { maxCount: 1, maxBytes: 4 * 1024 * MB, maxDurationSeconds: 600, vertical: "preferred" },
    requires: { tiktokDisclosure: true },
    note: "Video or photo carousel; vertical preferred; privacy level + disclosure required.",
  },
  // developers.snap.com / Public Profile API
  snapchat: {
    captionMax: 250,
    textOnlyAllowed: false,
    mediaRequired: true,
    image: { maxCount: 1, maxBytes: 5 * MB, maxDurationSeconds: null, vertical: "required" },
    video: { maxCount: 1, maxBytes: 1024 * MB, maxDurationSeconds: 180, vertical: "required" },
    requires: { snapchatDestination: true },
    note: "Media required; vertical full-frame. Destination Story / Saved Story / Spotlight. Spotlight is short vertical video.",
  },
};

export const SNAPCHAT_DESTINATIONS = ["story", "saved_story", "spotlight"] as const;
export const TIKTOK_PRIVACY_LEVELS = ["public", "friends", "private"] as const;
export const INSTAGRAM_POST_TYPES = ["feed", "reel", "story"] as const;
