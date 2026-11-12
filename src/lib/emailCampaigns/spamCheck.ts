// A spam check of the portal's own, before a campaign goes (the office chose
// built-in checks: nothing leaves the portal). It scores the things mail
// filters are known to weigh — shouting, money-and-urgency words, an email
// that is all pictures, links that hide where they go, link shorteners — and
// says how to fix each. A score, not a verdict: 0 is clean, 10 the worst.
//
// No portal imports, so the unit tests load it under plain Node.

import * as cheerio from "cheerio";

export type SpamFinding = { points: number; what: string; fix: string };
export type SpamReport = { score: number; level: "low" | "medium" | "high"; findings: SpamFinding[] };

/** Words and phrases spam filters weigh, as whole phrases. */
export const SPAM_PHRASES = [
  "100% free",
  "act now",
  "apply now and win",
  "as seen on",
  "buy now",
  "cash bonus",
  "click here",
  "congratulations you",
  "dear friend",
  "double your",
  "earn money",
  "extra income",
  "free gift",
  "free money",
  "guaranteed",
  "limited time only",
  "lowest price",
  "make money",
  "no cost",
  "no obligation",
  "once in a lifetime",
  "order now",
  "risk-free",
  "risk free",
  "urgent",
  "winner",
  "you have been selected",
  "you won",
  "100% guaranteed",
  "100% visa",
  "visa guaranteed",
];

const SHORTENERS = /^(bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|tiny\.cc|rb\.gy)$/i;

const hostOf = (raw: string): string | null => {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

function phrasesIn(text: string): string[] {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  return SPAM_PHRASES.filter((p) => new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(t));
}

function shouting(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length < 10) return false;
  return letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6;
}

/** Scores a campaign's subject, preview text and email. */
export function spamCheck(input: { subject: string; preheader?: string | null; html: string; text?: string | null }): SpamReport {
  const findings: SpamFinding[] = [];
  const add = (points: number, what: string, fix: string) => findings.push({ points, what, fix });
  const subject = input.subject.trim();

  // The subject line.
  if (shouting(subject)) add(1.5, "The subject is mostly CAPITAL LETTERS.", "Write it in normal sentence case.");
  if ((subject.match(/!/g) ?? []).length >= 2) add(1, "The subject has more than one exclamation mark.", "Use one at most.");
  if (/\$\$|€€|£££|%{2,}/.test(subject)) add(1, "The subject repeats money or percent signs.", "Say it in words.");
  if (/^\s*(re|fwd?)\s*:/i.test(subject)) add(1.5, "The subject starts with RE: or FW: as if it were a reply.", "Filters treat a fake reply as a trick — drop it.");
  if (subject.length > 100) add(0.5, "The subject is very long.", "Keep it under about 60 characters.");
  const subjectPhrases = phrasesIn(`${subject} ${input.preheader ?? ""}`);
  if (subjectPhrases.length) add(Math.min(3, subjectPhrases.length * 1), `The subject or preview text says “${subjectPhrases.join("”, “")}”.`, "Say what the email offers plainly instead.");

  // The body.
  const $ = cheerio.load(input.html);
  $("script, style, head").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim() || $.root().text().replace(/\s+/g, " ").trim();
  const images = $("img").length;
  if (images > 0 && bodyText.length < 200) add(2, "The email is almost all pictures and very little text.", "Add real text — filters cannot read pictures, and nor can people with images off.");
  if (!input.text?.trim()) add(1, "There is no plain-text version.", "Keep the plain-text version the template makes.");
  const bodyPhrases = phrasesIn(bodyText).filter((p) => !subjectPhrases.includes(p));
  if (bodyPhrases.length) add(Math.min(2, bodyPhrases.length * 0.5), `The email says “${bodyPhrases.join("”, “")}”.`, "Reword those phrases.");
  if ((bodyText.match(/!/g) ?? []).length > 10) add(0.5, "The email uses many exclamation marks.", "Use fewer.");
  const capsRuns = bodyText.match(/\b[A-Z]{4,}(?:\s+[A-Z]{4,}){3,}/g) ?? [];
  if (capsRuns.length) add(1, "Parts of the email are in CAPITAL LETTERS.", "Use bold or a heading instead of capitals.");

  // The links.
  const links = $("a[href]")
    .map((_, a) => ({ href: String($(a).attr("href") ?? "").trim(), text: $(a).text().trim() }))
    .get()
    .filter((l) => /^https?:\/\//i.test(l.href));
  if (links.some((l) => SHORTENERS.test(hostOf(l.href) ?? ""))) add(2, "A link uses a link shortener (bit.ly and the like).", "Link to the real address — spammers hide behind shorteners.");
  if (links.some((l) => /^https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(l.href))) add(2, "A link goes to a bare IP address.", "Use the website's name.");
  const misleading = links.filter((l) => {
    const shown = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.exec(l.text)?.[0];
    if (!shown) return false;
    const shownHost = hostOf(/^https?:/i.test(shown) ? shown : `https://${shown}`);
    const realHost = hostOf(l.href);
    return Boolean(shownHost && realHost && shownHost !== realHost && !realHost.endsWith(`.${shownHost}`) && !shownHost.endsWith(`.${realHost}`));
  });
  if (misleading.length) add(2, "A link's text shows one website but goes to another.", "Make the text match where it goes — this is what phishing looks like.");
  if (links.length > 25) add(0.5, `The email has ${links.length} links.`, "Fewer links read as less like an advert.");
  if (links.some((l) => /^http:\/\//i.test(l.href))) add(0.5, "A link is not https.", "Use https:// addresses.");

  const score = Math.min(10, Math.round(findings.reduce((s, f) => s + f.points, 0) * 10) / 10);
  return { score, level: score >= 5 ? "high" : score >= 2 ? "medium" : "low", findings: findings.sort((a, b) => b.points - a.points) };
}
