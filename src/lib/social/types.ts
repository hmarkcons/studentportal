// Core types for the Social Media module (0344). Pure, so unit tests read it
// directly.

export const SOCIAL_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "tiktok", "snapchat"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  snapchat: "Snapchat",
};

/** Facebook, Instagram and Threads share one Meta app / OAuth, but stay separate providers. */
export const META_PLATFORMS: readonly SocialPlatform[] = ["facebook", "instagram", "threads"];

export function isSocialPlatform(v: string): v is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(v);
}

export type SocialAccountStatus = "active" | "token_expiring" | "needs_reconnect" | "disconnected";

export type SocialAccount = {
  id: string;
  platform: SocialPlatform;
  external_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  status: SocialAccountStatus;
  scopes: string[];
  profile_ref: string | null;
  is_mock: boolean;
  token_expires_at: string | null;
  connected_at: string;
};

export const POST_STATUSES = [
  "draft",
  "pending_approval",
  "scheduled",
  "publishing",
  "published",
  "partially_published",
  "failed",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export type TargetStatus = "pending" | "publishing" | "published" | "failed";

/** What a provider returns after a successful token exchange / connect. */
export type ConnectedAccount = {
  external_id: string;
  display_name: string;
  username?: string | null;
  avatar_url?: string | null;
  scopes?: string[];
  /** Raw token blob to encrypt and store ({ access_token, refresh_token?, ... }). */
  token: Record<string, unknown>;
  token_expires_at?: string | null;
  /** Accounts the user can pick from (e.g. Snapchat Public Profiles, Meta Pages). */
  choices?: { id: string; name: string }[];
};

export type PublishInput = {
  caption: string;
  link: string | null;
  mediaUrls: string[];
  mediaKind: "image" | "video" | "none";
  options: Record<string, unknown>;
};

export type PublishResult =
  | { ok: true; platformPostId: string; url: string | null }
  | { ok: false; error: string; retryable: boolean }
  // IG / Threads / TikTok: a container was created, poll getStatus then publish.
  | { ok: "pending"; containerId: string };
