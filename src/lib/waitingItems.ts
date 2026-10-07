// What is waiting on whoever is looking, one item at a time.
//
// The dashboard's "Waiting on you" used to say how many of each thing there
// were — "3 documents to review" — and send the reader to the list of every
// student to find them. Now every waiting thing is an item: which student it
// is about, what it is, and the address where it is dealt with. The dashboard
// names the first few of each kind; /waiting lists them all, by student.
//
// Pure, with no imports, so the unit tests (scripts/waiting-items-test.mjs)
// read it under plain Node and both the card and the page share it.

export type WaitingKind =
  | "deadline"
  | "agreement"
  | "myagreement"
  | "leave"
  | "ticket"
  | "message"
  | "followup"
  | "task"
  | "document"
  | "inventory"
  | "instalment";

/** The kinds in the order they are listed: the ones that cannot wait first. */
export const WAITING_KINDS: readonly { kind: WaitingKind; one: string; many: string; short: string }[] = [
  { kind: "deadline", one: "application deadline in the next fortnight", many: "application deadlines in the next fortnight", short: "Deadlines" },
  { kind: "agreement", one: "agreement to verify", many: "agreements to verify", short: "Agreements" },
  { kind: "myagreement", one: "agreement of yours to sign", many: "agreements of yours to sign", short: "Your agreement" },
  { kind: "leave", one: "leave request to decide", many: "leave requests to decide", short: "Leave" },
  { kind: "ticket", one: "support ticket waiting on a reply", many: "support tickets waiting on a reply", short: "Tickets" },
  { kind: "message", one: "student awaiting a reply", many: "students awaiting a reply", short: "Messages" },
  { kind: "followup", one: "follow-up due", many: "follow-ups due", short: "Follow-ups" },
  { kind: "task", one: "task past its due date", many: "tasks past their due date", short: "Tasks" },
  { kind: "document", one: "document to review", many: "documents to review", short: "Documents" },
  { kind: "inventory", one: "inventory request awaiting a decision", many: "inventory requests awaiting a decision", short: "Inventory" },
  { kind: "instalment", one: "instalment overdue", many: "instalments overdue", short: "Instalments" },
];

export type WaitingItem = {
  kind: WaitingKind;
  /** Unique within its kind: the document's id, the task's, the ticket's. */
  id: string;
  /** Null for what is about no one student — an inventory request. */
  studentId: string | null;
  studentName: string | null;
  /** What it is: "Passport", "Bank statement — Università di Pavia". */
  title: string;
  /** A line under it: "submitted 2 h ago", "due 3 Oct 2026 — 2 days late". */
  detail: string | null;
  /** When it started waiting (ISO), oldest first; for a deadline, the day it falls due. */
  since: string | null;
  /** Where it is dealt with — the document itself, the task's row, the ticket. */
  href: string;
  /** Cannot be made up for by working faster tomorrow. */
  urgent: boolean;
  /** The viewer's own: their student, their task. */
  mine: boolean;
  /** A document somebody has opened from the list (0305), and is presumably reviewing. */
  opened?: { by: string; at: string; ago: string | null } | null;
};

/** "3 documents to review", "1 task past its due date". */
export function countLine(kind: WaitingKind, n: number): string {
  const k = WAITING_KINDS.find((w) => w.kind === kind)!;
  return `${n} ${n === 1 ? k.one : k.many}`;
}

/** A kind from a URL, or null for anything else. */
export function parseKind(value: string | null | undefined): WaitingKind | null {
  return WAITING_KINDS.some((w) => w.kind === value) ? (value as WaitingKind) : null;
}

/** Urgent first, then the longest waiting; one that never says when, last. Stable on title. */
export function sortItems(items: readonly WaitingItem[]): WaitingItem[] {
  return [...items].sort(
    (a, b) =>
      Number(b.urgent) - Number(a.urgent) ||
      (a.since === null ? 1 : 0) - (b.since === null ? 1 : 0) ||
      (a.since ?? "").localeCompare(b.since ?? "") ||
      a.title.localeCompare(b.title)
  );
}

/**
 * A Super Admin's or Management's queue: their own items in full, and the
 * rest of the office as one count per kind — "12 documents to review" — that
 * opens the list (the office chose this over every item, one by one).
 * Everyone else's own and office are the same list.
 */
export function splitOwnAndOffice(
  items: readonly WaitingItem[],
  officeTotals: boolean
): { own: WaitingItem[]; office: { kind: WaitingKind; count: number }[] } {
  if (!officeTotals) return { own: [...items], office: [] };
  const own = items.filter((i) => i.mine);
  const office = WAITING_KINDS.map((w) => ({ kind: w.kind, count: items.filter((i) => i.kind === w.kind && !i.mine).length })).filter((c) => c.count > 0);
  return { own, office };
}

/** Narrowed to one kind, to the viewer's own, or both. */
export function filterItems(items: readonly WaitingItem[], { kind = null, mine = false }: { kind?: WaitingKind | null; mine?: boolean }): WaitingItem[] {
  return items.filter((i) => (!kind || i.kind === kind) && (!mine || i.mine));
}

/** How many there are of each kind, in listing order, the empty ones left out. */
export function kindCounts(items: readonly WaitingItem[]): { kind: WaitingKind; count: number; short: string }[] {
  return WAITING_KINDS.map((w) => ({ kind: w.kind, short: w.short, count: items.filter((i) => i.kind === w.kind).length })).filter(
    (c) => c.count > 0
  );
}

export type StudentGroup = { studentId: string | null; studentName: string; items: WaitingItem[] };

/**
 * Items gathered under the student they are about: the student with
 * something urgent first, then whoever has waited longest. What is about no
 * student goes last, under a heading of its own.
 */
export function groupByStudent(items: readonly WaitingItem[]): StudentGroup[] {
  const groups = new Map<string, StudentGroup>();
  for (const item of sortItems(items)) {
    const key = item.studentId ?? "";
    const group = groups.get(key) ?? { studentId: item.studentId, studentName: item.studentName ?? "Not about one student", items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  const rank = (g: StudentGroup) => g.items[0];
  return [...groups.values()].sort((a, b) => {
    if ((a.studentId === null) !== (b.studentId === null)) return a.studentId === null ? 1 : -1;
    const [x, y] = [rank(a), rank(b)];
    return (
      Number(y.urgent) - Number(x.urgent) ||
      (x.since ?? "￿").localeCompare(y.since ?? "￿") ||
      a.studentName.localeCompare(b.studentName)
    );
  });
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago" — for a list read at a glance. */
export function ago(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** How late a due date is, in whole days, as Karachi counts them. */
export function daysLate(dueDate: string, today: string): number {
  const [y1, m1, d1] = dueDate.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "1 day late", "12 days late". */
export function lateText(days: number): string {
  return `${days} day${days === 1 ? "" : "s"} late`;
}

/**
 * Where a document waiting for review is opened from the list: through
 * /waiting/open, which marks it seen (0305) and then lands on the document
 * itself — its section open, the row picked out.
 */
export function openDocumentHref(documentId: string): string {
  return `/waiting/open/document/${documentId}`;
}

/** The document's own place on the student's Documents tab. */
export function documentTargetHref(studentId: string, documentId: string, cycleId: string | null): string {
  const cycle = cycleId ? `&cycle=${cycleId}` : "";
  return `/students/${studentId}/documents?doc=${documentId}${cycle}#doc-${documentId}`;
}
