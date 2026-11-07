import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { KNOWN_MAIL_DOMAINS } from "./contactImport";

/**
 * Whether a domain can receive email: it has a mail server (MX), or, failing
 * that, an address a mail server would fall back to. Null when DNS did not
 * answer in time — not a reason to refuse an address.
 */
export async function domainAcceptsMail(domain: string, timeoutMs = 4000): Promise<boolean | null> {
  if (KNOWN_MAIL_DOMAINS.has(domain)) return true;
  const ask = async () => {
    try {
      const mx = await resolveMx(domain);
      if (mx.some((r) => r.exchange && r.exchange !== ".")) return true;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "ENODATA" && code !== "ENOTFOUND") return null;
    }
    for (const fallback of [resolve4, resolve6]) {
      try {
        if ((await fallback(domain)).length) return true;
      } catch {
        // Nothing there either.
      }
    }
    return false;
  };
  return Promise.race([ask(), new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
}

/** Each domain asked once, a few at a time. */
export async function checkDomains(domains: string[], concurrency = 8): Promise<Map<string, boolean | null>> {
  const unique = [...new Set(domains)];
  const out = new Map<string, boolean | null>();
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const answers = await Promise.all(batch.map((d) => domainAcceptsMail(d)));
    batch.forEach((d, j) => out.set(d, answers[j]));
  }
  return out;
}
