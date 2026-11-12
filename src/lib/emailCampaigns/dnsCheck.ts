// The DNS records a sending domain needs for Amazon SES, and whether each is
// in place. Mail providers trust a sender whose domain proves the mail is its
// own: DKIM (Amazon signs every email; three CNAMEs point at its keys), a
// custom MAIL FROM (bounces come back to a subdomain of ours, so SPF passes
// for our domain, not Amazon's), and DMARC (the policy that ties the two to
// the address people see). With all three aligned, Gmail and Yahoo's bulk
// sender rules are met.
//
// The lookups are passed in, so the unit tests run without a network. No
// portal imports.

export type DnsRecordKind = "dkim" | "mail_from_mx" | "mail_from_spf" | "dmarc";

export type ExpectedRecord = {
  kind: DnsRecordKind;
  type: "CNAME" | "MX" | "TXT";
  name: string;
  value: string;
  why: string;
};

export type RecordCheck = ExpectedRecord & { status: "pass" | "fail" | "waiting"; found: string[]; note?: string };

export type Resolver = {
  cname(name: string): Promise<string[]>;
  mx(name: string): Promise<{ exchange: string; priority: number }[]>;
  txt(name: string): Promise<string[][]>;
};

/** The MAIL FROM subdomain used under the sending domain. */
export const MAIL_FROM_LABEL = "bounce";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const TOKEN_RE = /^[a-z0-9]{20,64}$/;

/** A domain as typed ("News.HMARKconsultants.com.") → "news.hmarkconsultants.com", or null. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  return d && d.length <= 253 && DOMAIN_RE.test(d) ? d : null;
}

/** The domain of an address: "news@news.hmarkconsultants.com" → "news.hmarkconsultants.com". */
export function domainOf(email: string | null | undefined): string | null {
  const at = String(email ?? "").lastIndexOf("@");
  return at > 0 ? normalizeDomain(String(email).slice(at + 1)) : null;
}

/** DKIM tokens as pasted from Amazon — one a line, or separated by spaces or commas; at most five. */
export function parseDkimTokens(raw: string | null | undefined): { tokens: string[] } | { error: string } {
  const parts = String(raw ?? "")
    .split(/[\s,;]+/)
    .map((t) => t.trim().toLowerCase().replace(/\._domainkey.*$/, "").replace(/\.dkim\.amazonses\.com\.?$/, ""))
    .filter(Boolean);
  const tokens = [...new Set(parts)];
  if (tokens.length > 5) return { error: "Amazon gives three DKIM tokens; paste those three." };
  const bad = tokens.find((t) => !TOKEN_RE.test(t));
  if (bad) return { error: `“${bad}” is not a DKIM token — copy the long code from each of Amazon's three DKIM records.` };
  return { tokens };
}

/** The organisational domain a subdomain sits under: "news.hmarkconsultants.com" → "hmarkconsultants.com". */
export function parentDomain(domain: string): string | null {
  const parts = domain.split(".");
  return parts.length > 2 ? parts.slice(1).join(".") : null;
}

/** Every record the domain needs, with what it is for. */
export function expectedRecords({ domain, region, dkimTokens }: { domain: string; region: string; dkimTokens: string[] }): ExpectedRecord[] {
  const mailFrom = `${MAIL_FROM_LABEL}.${domain}`;
  const dkim: ExpectedRecord[] = (dkimTokens.length ? dkimTokens : ["(token 1)", "(token 2)", "(token 3)"]).map((t) => ({
    kind: "dkim",
    type: "CNAME",
    name: `${t}._domainkey.${domain}`,
    value: `${t}.dkim.amazonses.com`,
    why: "DKIM: lets Amazon sign every email as the domain's own.",
  }));
  return [
    ...dkim,
    {
      kind: "mail_from_mx",
      type: "MX",
      name: mailFrom,
      value: `10 feedback-smtp.${region}.amazonses.com`,
      why: "MAIL FROM: bounces come back to our own subdomain, so SPF passes for our domain.",
    },
    {
      kind: "mail_from_spf",
      type: "TXT",
      name: mailFrom,
      value: '"v=spf1 include:amazonses.com ~all"',
      why: "SPF: says Amazon may send for the MAIL FROM subdomain.",
    },
    {
      kind: "dmarc",
      type: "TXT",
      name: `_dmarc.${domain}`,
      value: `"v=DMARC1; p=none; rua=mailto:dmarc-reports@${parentDomain(domain) ?? domain}"`,
      why: "DMARC: the policy tying DKIM and SPF to the address people see. Start at p=none; move to p=quarantine once reports are clean.",
    },
  ];
}

const bare = (s: string) => s.trim().toLowerCase().replace(/\.$/, "");

async function safe<T>(look: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await look();
  } catch {
    // NXDOMAIN, no such record, or a timeout: all read as "not there".
    return empty;
  }
}

/** Looks each record up and says whether it is right. */
export async function checkRecords(records: ExpectedRecord[], resolver: Resolver, { domain, hasTokens }: { domain: string; hasTokens: boolean }): Promise<RecordCheck[]> {
  const out: RecordCheck[] = [];
  for (const r of records) {
    if (r.kind === "dkim") {
      if (!hasTokens) {
        out.push({ ...r, status: "waiting", found: [], note: "Paste Amazon's three DKIM tokens above (they appear once the domain is added in SES)." });
        continue;
      }
      const found = (await safe(() => resolver.cname(r.name), [] as string[])).map(bare);
      out.push({ ...r, status: found.includes(bare(r.value)) ? "pass" : "fail", found });
    } else if (r.kind === "mail_from_mx") {
      const found = (await safe(() => resolver.mx(r.name), [] as { exchange: string; priority: number }[])).map((m) => `${m.priority} ${bare(m.exchange)}`);
      const want = bare(r.value.split(" ")[1]);
      out.push({ ...r, status: found.some((f) => f.endsWith(` ${want}`)) ? "pass" : "fail", found });
    } else if (r.kind === "mail_from_spf") {
      const found = (await safe(() => resolver.txt(r.name), [] as string[][])).map((chunks) => chunks.join(""));
      const spf = found.filter((t) => /^v=spf1\b/i.test(t.trim()));
      const ok = spf.length === 1 && /\binclude:amazonses\.com\b/i.test(spf[0]);
      out.push({
        ...r,
        status: ok ? "pass" : "fail",
        found,
        note: spf.length > 1 ? "There are two SPF records; a domain may have only one — merge them." : undefined,
      });
    } else {
      const own = (await safe(() => resolver.txt(r.name), [] as string[][])).map((chunks) => chunks.join("")).filter((t) => /^v=DMARC1\b/i.test(t.trim()));
      if (own.length) {
        out.push({ ...r, status: own.length === 1 ? "pass" : "fail", found: own, note: own.length > 1 ? "There are two DMARC records; keep one." : policyNote(own[0]) });
        continue;
      }
      // No record of its own: the parent domain's DMARC policy covers a subdomain.
      const parent = parentDomain(domain);
      const inherited = parent
        ? (await safe(() => resolver.txt(`_dmarc.${parent}`), [] as string[][])).map((chunks) => chunks.join("")).filter((t) => /^v=DMARC1\b/i.test(t.trim()))
        : [];
      out.push({
        ...r,
        status: inherited.length === 1 ? "pass" : "fail",
        found: inherited,
        note: inherited.length === 1 ? `Covered by ${parent}'s own DMARC record. ${policyNote(inherited[0]) ?? ""}`.trim() : undefined,
      });
    }
  }
  return out;
}

function policyNote(record: string): string | undefined {
  const p = /\bp=(none|quarantine|reject)\b/i.exec(record)?.[1]?.toLowerCase();
  if (p === "none") return "Policy p=none: monitoring only. Move to p=quarantine once the reports are clean.";
  return p ? `Policy p=${p}.` : undefined;
}

/** All in place: every record passes (none waiting). */
export function allPass(checks: RecordCheck[]): boolean {
  return checks.length > 0 && checks.every((c) => c.status === "pass");
}
