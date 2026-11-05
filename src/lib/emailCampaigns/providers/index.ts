import type { EmailProvider, ProviderId } from "./types";

export type { EmailProvider, OutgoingEmail, NormalizedEvent, ProviderId } from "./types";

/**
 * The env vars each service needs. Listed in .env.example; the Settings tab
 * shows which are set. Nothing is sent in bulk until one service has all of
 * its keys and is chosen in Settings.
 */
export const PROVIDER_ENV: Record<ProviderId, { label: string; vars: string[] }> = {
  ses: {
    label: "Amazon SES",
    vars: ["SES_REGION", "SES_ACCESS_KEY_ID", "SES_SECRET_ACCESS_KEY", "SES_CONFIGURATION_SET"],
  },
  resend: {
    label: "Resend",
    vars: ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"],
  },
};

export function providerConfigured(id: ProviderId): boolean {
  return PROVIDER_ENV[id].vars.every((v) => Boolean(process.env[v]?.trim()));
}

/** Which of a service's keys are missing, for the Settings tab. */
export function missingProviderEnv(id: ProviderId): string[] {
  return PROVIDER_ENV[id].vars.filter((v) => !process.env[v]?.trim());
}

/**
 * The service campaigns are sent through: the one chosen in Settings, if all
 * of its keys are set. Null until the office has bought one and connected it —
 * the adapters themselves are written when the service is chosen (Phase 3),
 * against the interface in ./types.
 */
export function getCampaignProvider(chosen: string | null | undefined): EmailProvider | null {
  if (chosen !== "ses" && chosen !== "resend") return null;
  if (!providerConfigured(chosen)) return null;
  return null;
}
