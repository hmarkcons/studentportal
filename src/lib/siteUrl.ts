// Absolute base URL for links that leave the app (currently the "View
// receipt" button in invoice emails). A relative path is useless in an email
// client, so this has to resolve to a real origin.
//
// NEXT_PUBLIC_SITE_URL wins when set — use it to point emails at a custom
// domain. Otherwise Vercel's own production-domain variable is used, so
// nothing has to be configured for this to work on a normal deployment.
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  // Set by Vercel to the project's production domain on every deployment,
  // including preview builds — so a preview never mails out a link that
  // points at itself and dies when the preview is torn down.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
