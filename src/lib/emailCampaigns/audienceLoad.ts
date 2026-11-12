import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAD_STATUS_LABELS } from "@/lib/constants";
import { countriesOf, normalizeEmail, titleCase, type AddressState, type AudienceContact, type ContactStatus, type Engagement, type OptionSource } from "./audience";

// Everyone an email campaign could reach, read once: every lead (students are
// leads) and every imported contact, with what segments filter on — their
// applications' stages and the lists they are on — and the state of each
// address that is not simply "subscribed to everything".
//
// Read through the service role by callers that have already checked the
// person may use email campaigns: the audience is all of HMARK's contacts,
// not the slice of leads one counsellor may see.

async function allRows<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await read(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

type LeadRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  country_of_interest: string | null;
  city: string | null;
  intake: string | null;
  status: string | null;
  level_applying_for: string | null;
  platform_source: string | null;
  assigned_counselor_id: string | null;
  date_of_inquiry: string | null;
  created_at: string;
};
type ContactRow = { id: string; email: string; full_name: string | null; country_of_interest: string | null; city: string | null; intake: string | null; source: string | null; created_at: string };

export type LoadedAudience = { contacts: AudienceContact[]; statuses: Map<string, AddressState> };

export async function loadAudience(admin: SupabaseClient): Promise<LoadedAudience> {
  const [leads, contacts, applications, members, states, sends, engagedAt] = await Promise.all([
    allRows<LeadRow>((a, b) =>
      admin
        .from("leads")
        .select("id, email, full_name, country_of_interest, city, intake, status, level_applying_for, platform_source, assigned_counselor_id, date_of_inquiry, created_at")
        .order("id")
        .range(a, b)
    ),
    allRows<ContactRow>((a, b) => admin.from("email_contacts").select("id, email, full_name, country_of_interest, city, intake, source, created_at").order("id").range(a, b)),
    allRows<{ student_id: string; current_stage: string | null }>((a, b) => admin.from("applications").select("student_id, current_stage").order("id").range(a, b)),
    allRows<{ list_id: string; lead_id: string | null; contact_id: string | null }>((a, b) =>
      admin.from("email_list_members").select("list_id, lead_id, contact_id").order("id").range(a, b)
    ),
    allRows<{ email: string; status: ContactStatus; topics: string[] | null }>((a, b) =>
      admin.from("email_contact_status").select("email, status, topics").or("status.neq.subscribed,topics.neq.{}").order("email").range(a, b)
    ),
    // Each address's record across real campaigns (0360), for the "Email activity" rules.
    allRows<{ email: string; received: number; last_sent_at: string | null; last_opened: boolean; last_clicked: boolean; ever_opened: boolean; ever_clicked: boolean }>((a, b) =>
      admin.rpc("email_engagement_by_address").order("email").range(a, b)
    ),
    allRows<{ email: string; last_engaged_at: string }>((a, b) =>
      admin.from("email_contact_status").select("email, last_engaged_at").not("last_engaged_at", "is", null).order("email").range(a, b)
    ),
  ]);

  const lastEngaged = new Map(engagedAt.map((e) => [e.email, e.last_engaged_at]));
  const engagement = new Map<string, Engagement>(
    sends.map((r) => [
      r.email,
      {
        received: Number(r.received),
        lastSentAt: r.last_sent_at,
        lastOpened: Boolean(r.last_opened),
        lastClicked: Boolean(r.last_clicked),
        everOpened: Boolean(r.ever_opened),
        everClicked: Boolean(r.ever_clicked),
        lastEngagedAt: lastEngaged.get(r.email) ?? null,
      },
    ])
  );
  // Someone never sent a real campaign can still have engaged (a test, or a practice link followed).
  const engagementOf = (email: string | null): Engagement | null => {
    if (!email) return null;
    const e = engagement.get(email);
    if (e) return e;
    const at = lastEngaged.get(email);
    return at ? { received: 0, lastSentAt: null, lastOpened: false, lastClicked: false, everOpened: false, everClicked: false, lastEngagedAt: at } : null;
  };

  const stages = new Map<string, string[]>();
  for (const a of applications) {
    const list = stages.get(a.student_id) ?? [];
    if (a.current_stage) list.push(a.current_stage);
    stages.set(a.student_id, list);
  }
  const listsOf = new Map<string, string[]>();
  for (const m of members) {
    const key = m.lead_id ? `lead:${m.lead_id}` : `contact:${m.contact_id}`;
    listsOf.set(key, [...(listsOf.get(key) ?? []), m.list_id]);
  }

  const out: AudienceContact[] = leads.map((l) => ({
    key: `lead:${l.id}`,
    kind: "lead",
    id: l.id,
    email: normalizeEmail(l.email),
    fullName: (l.full_name ?? "").trim(),
    country: l.country_of_interest ?? "",
    city: (l.city ?? "").trim(),
    intake: l.intake ?? "",
    leadStatus: l.status,
    level: l.level_applying_for ?? "",
    source: (l.platform_source ?? "").trim(),
    counsellorId: l.assigned_counselor_id,
    enquiredAt: l.date_of_inquiry ?? l.created_at,
    hasApplication: stages.has(l.id),
    applicationStages: stages.get(l.id) ?? [],
    lists: listsOf.get(`lead:${l.id}`) ?? [],
    engagement: engagementOf(normalizeEmail(l.email)),
  }));
  for (const c of contacts) {
    out.push({
      key: `contact:${c.id}`,
      kind: "contact",
      id: c.id,
      email: normalizeEmail(c.email),
      fullName: (c.full_name ?? "").trim(),
      country: c.country_of_interest ?? "",
      city: (c.city ?? "").trim(),
      intake: c.intake ?? "",
      leadStatus: null,
      level: "",
      source: c.source ? `Imported: ${c.source}` : "Imported",
      counsellorId: null,
      enquiredAt: c.created_at,
      hasApplication: false,
      applicationStages: [],
      lists: listsOf.get(`contact:${c.id}`) ?? [],
      engagement: engagementOf(normalizeEmail(c.email)),
    });
  }
  return { contacts: out, statuses: new Map(states.map((s) => [s.email, { status: s.status, topics: s.topics ?? [] }])) };
}

export type FieldOption = { value: string; label: string; count?: number };

/** The choices each multi-choice field offers, from the contacts themselves and the portal's lists. */
export async function audienceOptions(admin: SupabaseClient, contacts: AudienceContact[]): Promise<Record<OptionSource, FieldOption[]>> {
  const tally = (pick: (c: AudienceContact) => string[]) => {
    const m = new Map<string, number>();
    for (const c of contacts) for (const v of pick(c)) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: titleCase(value), count }));
  };
  const [{ data: staff }, { data: lists }] = await Promise.all([
    admin.from("staff").select("id, full_name").contains("roles", ["counselor"]).order("full_name"),
    admin.from("email_lists").select("id, name").order("name"),
  ]);
  const counsellorCounts = new Map<string, number>();
  for (const c of contacts) if (c.counsellorId) counsellorCounts.set(c.counsellorId, (counsellorCounts.get(c.counsellorId) ?? 0) + 1);
  return {
    lead_statuses: Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label, count: contacts.filter((c) => c.leadStatus === value).length })),
    countries: tally((c) => countriesOf(c.country)),
    cities: tally((c) => [c.city.toLowerCase()]),
    levels: tally((c) => [c.level.toLowerCase()]),
    sources: tally((c) => [c.source]).map((o) => ({ ...o, label: o.value })),
    counsellors: (staff ?? []).map((s) => ({ value: s.id as string, label: s.full_name as string, count: counsellorCounts.get(s.id as string) ?? 0 })),
    stages: tally((c) => c.applicationStages).map((o) => ({ ...o, label: titleCase(o.value.replace(/_/g, " ")) })),
    lists: (lists ?? []).map((l) => ({ value: l.id as string, label: l.name as string, count: contacts.filter((c) => c.lists.includes(l.id as string)).length })),
    contact_types: [
      { value: "lead", label: "Lead or student", count: contacts.filter((c) => c.kind === "lead").length },
      { value: "contact", label: "Imported contact", count: contacts.filter((c) => c.kind === "contact").length },
    ],
  };
}
