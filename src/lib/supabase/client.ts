import { createBrowserClient } from "@supabase/ssr";
import { hasSessionOnlyMarker, sessionOnlyCookieOptions } from "@/lib/sessionCookies";

type CookieOptions = { path?: string; domain?: string; maxAge?: number; expires?: Date; sameSite?: boolean | "lax" | "strict" | "none"; secure?: boolean };

function writeCookie(name: string, value: string, options: CookieOptions = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`];
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (typeof options.maxAge === "number") parts.push(`Max-Age=${options.maxAge}`);
  if (options.expires) parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite === true ? "Strict" : options.sameSite}`);
  if (options.secure || location.protocol === "https:") parts.push("Secure");
  document.cookie = parts.join("; ");
}

export function createClient() {
  // Someone who left "Keep me signed in" unticked: a token refreshed in the
  // browser is written without an expiry, so it still goes when the browser
  // closes (sessionCookies.ts). Everyone else gets @supabase/ssr's own
  // cookie handling, unchanged.
  if (typeof document === "undefined" || !hasSessionOnlyMarker(document.cookie)) {
    return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return document.cookie
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const at = part.indexOf("=");
            return { name: part.slice(0, at), value: decodeURIComponent(part.slice(at + 1)) };
          });
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => writeCookie(name, value, sessionOnlyCookieOptions(options as CookieOptions & Record<string, unknown>)));
      },
    },
  });
}
