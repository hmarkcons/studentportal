// The one interface every platform implements (Facebook, Instagram, Threads,
// LinkedIn, TikTok, Snapchat, plus the sandbox Mock). One implementation file
// per platform under ./providers; the registry picks which to use.

import type { ConnectedAccount, PublishInput, PublishResult, SocialAccount, SocialPlatform } from "./types.ts";

export interface SocialProvider {
  readonly platform: SocialPlatform;
  /** False until its app credentials are set in env; the registry then falls back to the mock. */
  readonly configured: boolean;

  // --- OAuth / connection ---
  /** Where to send the user to authorise. */
  getAuthUrl(state: string, redirectUri: string): string;
  /** Exchange the returned code for an account and its token. */
  exchangeCode(code: string, redirectUri: string): Promise<ConnectedAccount>;
  /** A fresh token + expiry, or null if this platform's token can't be refreshed. */
  refreshToken(token: Record<string, unknown>): Promise<{ token: Record<string, unknown>; expiresAt: string | null } | null>;
  /** Is the stored token still good? */
  validate(account: SocialAccount, token: Record<string, unknown>): Promise<boolean>;
  disconnect(account: SocialAccount, token: Record<string, unknown>): Promise<void>;

  // --- publishing ---
  /** Publish now. May return `pending` with a container id for IG/Threads/TikTok. */
  publish(account: SocialAccount, token: Record<string, unknown>, input: PublishInput): Promise<PublishResult>;
  /** Poll an async container created by publish(). */
  getStatus(account: SocialAccount, token: Record<string, unknown>, containerId: string): Promise<PublishResult>;

  // --- analytics ---
  /** Metrics for a published post, or null where the API doesn't provide them. */
  fetchMetrics(account: SocialAccount, token: Record<string, unknown>, platformPostId: string): Promise<Record<string, number> | null>;
}
