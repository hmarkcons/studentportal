// A document's guide: how a student gets it, what it must show, and what a
// correct one looks like (0300).
//
// The full guide is plain text with light formatting — staff type it, the
// builder's toolbar inserts the marks, and parseGuide() turns it into blocks
// that a component renders as elements. It is never stored or rendered as
// HTML, so nothing written into a guide can put markup or script into a
// student's page; a link is only a link when its address is http(s), mailto
// or tel.
//
//   ## A heading            a line of its own
//   1. A step               numbered steps, in order
//   - A point               bullets (also * or •)
//   **bold**                inline
//   [the office](https://…) a link with words, or a bare https://… address
//
// Pure — no "@/" imports and relative imports with their extension — so the
// unit tests load it under plain Node.

import { parseVideoUrl, watchUrl, type VideoEmbed } from "./videoEmbed.ts";

/** How long each part may be; the database holds the same limits (0300). */
export const GUIDE_LIMITS = { note: 600, body: 8000, countryNote: 1000 } as const;

// ---------------------------------------------------------------- the guide

export type GuideInline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

export type GuideBlock =
  | { kind: "heading"; text: GuideInline[] }
  | { kind: "paragraph"; lines: GuideInline[][] }
  | { kind: "steps"; items: GuideInline[][] }
  | { kind: "bullets"; items: GuideInline[][] };

/** An address a guide may link to, or null. Anything else stays as words. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^(mailto|tel):/i.test(href)) return /^(mailto|tel):[^\s<>"']+$/i.test(href) ? href : null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// **bold**, [label](address), or a bare address. A bare address stops before
// trailing punctuation, so "see https://x.pk." does not link the full stop.
const INLINE = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;

export function parseInline(line: string): GuideInline[] {
  const out: GuideInline[] = [];
  const push = (item: GuideInline) => {
    const last = out[out.length - 1];
    if (item.kind === "text" && last?.kind === "text") last.text += item.text;
    else if (item.kind !== "text" || item.text) out.push(item);
  };
  let at = 0;
  for (const m of line.matchAll(INLINE)) {
    const index = m.index ?? 0;
    push({ kind: "text", text: line.slice(at, index) });
    if (m[1] !== undefined) {
      push({ kind: "bold", text: m[1] });
    } else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      // A link to something other than a web page, mail or phone is shown as
      // the words it was written with, not as a link.
      push(href ? { kind: "link", text: m[2], href } : { kind: "text", text: m[0] });
    } else {
      const href = safeHref(m[4]);
      push(href ? { kind: "link", text: m[4], href } : { kind: "text", text: m[4] });
    }
    at = index + m[0].length;
  }
  push({ kind: "text", text: line.slice(at) });
  return out;
}

const STEP = /^\s*\d{1,3}[.)]\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const HEADING = /^\s*#{1,3}\s+(.*)$/;

/** The guide as blocks, in order. Empty text is no blocks. */
export function parseGuide(body: string | null | undefined): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  const lines = (body ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      // A blank line ends a paragraph or a list; the next line starts afresh.
      if (last && last.kind !== "heading") blocks.push({ kind: "paragraph", lines: [] });
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(HEADING))) {
      blocks.push({ kind: "heading", text: parseInline(m[1].trim()) });
    } else if ((m = line.match(STEP))) {
      if (last?.kind === "steps") last.items.push(parseInline(m[1].trim()));
      else blocks.push({ kind: "steps", items: [parseInline(m[1].trim())] });
    } else if ((m = line.match(BULLET))) {
      if (last?.kind === "bullets") last.items.push(parseInline(m[1].trim()));
      else blocks.push({ kind: "bullets", items: [parseInline(m[1].trim())] });
    } else if (last?.kind === "paragraph") {
      last.lines.push(parseInline(line.trim()));
    } else {
      blocks.push({ kind: "paragraph", lines: [parseInline(line.trim())] });
    }
  }
  // The empty paragraphs blank lines opened and nothing filled.
  return blocks.filter((b) => b.kind !== "paragraph" || b.lines.length > 0);
}

// ------------------------------------------------------------- the toolbar

export type GuideFormat = "bold" | "heading" | "steps" | "bullets" | "link";

/**
 * What a toolbar button does to the text: the new text and where the
 * selection goes. Bold and link wrap the selection (or a placeholder); the
 * others mark every line the selection touches, numbering steps from one.
 */
export function applyGuideFormat(
  text: string,
  start: number,
  end: number,
  format: GuideFormat
): { text: string; start: number; end: number } {
  const [from, to] = start <= end ? [start, end] : [end, start];
  if (format === "bold" || format === "link") {
    const chosen = text.slice(from, to) || (format === "bold" ? "important words" : "the office's page");
    const before = format === "bold" ? "**" : "[";
    const after = format === "bold" ? "**" : "](https://)";
    const next = text.slice(0, from) + before + chosen + after + text.slice(to);
    const selStart = from + before.length;
    // A new link leaves the cursor in the address, which is what is typed next.
    if (format === "link") return { text: next, start: selStart + chosen.length + 2, end: selStart + chosen.length + 2 + "https://".length };
    return { text: next, start: selStart, end: selStart + chosen.length };
  }
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  const nextBreak = text.indexOf("\n", to);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split("\n");
  const bare = (l: string) => l.replace(HEADING, "$1").replace(STEP, "$1").replace(BULLET, "$1");
  const marked = lines.map((l, i) => {
    const plain = bare(l);
    if (format === "heading") return `## ${plain}`;
    if (format === "steps") return `${i + 1}. ${plain}`;
    return `- ${plain}`;
  });
  const replaced = marked.join("\n");
  const next = text.slice(0, lineStart) + replaced + text.slice(lineEnd);
  return { text: next, start: lineStart, end: lineStart + replaced.length };
}

// -------------------------------------------------------- the whole guide

/** A guide as stored — on a requirement, or on a profile document's kind. */
export type StoredGuide = {
  description: string | null;
  guide_body: string | null;
  sample_file_path: string | null;
  sample_file_name: string | null;
  guide_video_provider: string | null;
  guide_video_id: string | null;
};

export const GUIDE_COLUMNS = "description, guide_body, sample_file_path, sample_file_name, guide_video_provider, guide_video_id";

export type GuideVideo = VideoEmbed & { watchUrl: string };

/** The video a guide stores, composed afresh — the address is never stored. */
export function guideVideo(g: Pick<StoredGuide, "guide_video_provider" | "guide_video_id">): GuideVideo | null {
  if (!g.guide_video_provider || !g.guide_video_id) return null;
  const url = g.guide_video_provider === "youtube" ? `https://youtu.be/${g.guide_video_id}` : `https://vimeo.com/${g.guide_video_id}`;
  const embed = parseVideoUrl(url);
  return embed ? { ...embed, watchUrl: watchUrl(embed) } : null;
}

/** Whether a stored guide says anything at all. */
export function hasGuide(g: Partial<StoredGuide> | null | undefined): boolean {
  if (!g) return false;
  return Boolean(
    (g.description ?? "").trim() || (g.guide_body ?? "").trim() || g.sample_file_path || (g.guide_video_provider && g.guide_video_id)
  );
}

/** Whether there is more than the note — worth a "How to prepare this". */
export function hasFullGuide(g: Partial<StoredGuide> | null | undefined, countryNotes = 0): boolean {
  if (!g) return countryNotes > 0;
  return Boolean((g.guide_body ?? "").trim() || g.sample_file_path || (g.guide_video_provider && g.guide_video_id) || countryNotes > 0);
}

// ----------------------------------------------------- profile documents

/** The requirements derived from a student's profile (documentChecklist.ts), one guide each. */
export const PROFILE_GUIDE_KINDS = [
  { kind: "qualification:certificate", label: "Qualification certificate", example: "Bachelors (4 years) — certificate — Karachi University" },
  { kind: "qualification:transcript", label: "Transcript / marksheet", example: "Bachelors (4 years) — transcript / marksheet — Karachi University" },
  { kind: "test:scorecard", label: "Test scorecard", example: "IELTS Academic — scorecard" },
  { kind: "profile:travel_history", label: "Previous travel history — visas & stamps", example: "Previous travel history — visas & stamps" },
  { kind: "profile:visa_refusals", label: "Previous refusal / deportation papers", example: "Previous refusal / deportation papers" },
] as const;

export type ProfileGuideKind = (typeof PROFILE_GUIDE_KINDS)[number]["kind"];

export function isProfileGuideKind(kind: string): kind is ProfileGuideKind {
  return PROFILE_GUIDE_KINDS.some((k) => k.kind === kind);
}

/**
 * Which profile guide a derived requirement reads: its key without the
 * qualification's or test's own id — every bachelor's certificate shares one.
 */
export function profileGuideKind(derivedKey: string | null | undefined): ProfileGuideKind | null {
  if (!derivedKey) return null;
  const parts = derivedKey.split(":");
  const kind = parts.length === 3 ? `${parts[0]}:${parts[2]}` : derivedKey;
  return isProfileGuideKind(kind) ? kind : null;
}

// --------------------------------------------------------- country notes

export type CountryNote = { destinationId: string; destinationName: string; note: string };

/**
 * The country notes a student should read under a requirement, in the order
 * of their countries (primary first).
 *
 * A requirement of one application is that application's country; a shared
 * one is every country the student is going through, so each note is named
 * after its country. A note for a country the student is not applying to is
 * not theirs to read.
 */
export function notesForStudent(
  notes: readonly { destinationId: string; note: string }[],
  studentCountries: readonly { id: string; name: string }[],
  documentCountry: string | null
): CountryNote[] {
  const countries = documentCountry ? studentCountries.filter((c) => c.id === documentCountry) : studentCountries;
  return countries.flatMap((c) => {
    const found = notes.find((n) => n.destinationId === c.id && n.note.trim());
    return found ? [{ destinationId: c.id, destinationName: c.name, note: found.note.trim() }] : [];
  });
}
