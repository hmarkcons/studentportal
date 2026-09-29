import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GUIDE_COLUMNS,
  guideVideo,
  hasGuide,
  notesForStudent,
  parseGuide,
  profileGuideKind,
  type CountryNote,
  type GuideBlock,
  type GuideVideo,
  type StoredGuide,
} from "./documentGuide.ts";

/**
 * A requirement's guide as a page shows it: parsed, its sample signed, its
 * video composed, and the notes of this student's own countries beneath it.
 * Plain data, so it crosses to a client component as it is.
 */
export type ResolvedGuide = {
  note: string | null;
  blocks: GuideBlock[];
  sampleUrl: string | null;
  sampleName: string | null;
  video: GuideVideo | null;
  countryNotes: CountryNote[];
};

type GuideDoc = { id: string; template_id?: string | null; derived_key?: string | null; application_id?: string | null };

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/**
 * The guide for each of a student's documents that has one, by document id.
 *
 * Read with the page's own client: the requirements, the profile guides and
 * the country notes are readable by anyone signed in (0300), and so are the
 * samples, so a student and a counsellor are shown exactly the same thing.
 * A document with neither a guide nor a note of its country is left out.
 */
export async function loadDocumentGuides(
  supabase: SupabaseClient,
  studentId: string,
  docs: readonly GuideDoc[]
): Promise<Record<string, ResolvedGuide>> {
  const templateIds = [...new Set(docs.map((d) => d.template_id).filter((v): v is string => Boolean(v)))];
  const kinds = [...new Set(docs.map((d) => profileGuideKind(d.derived_key)).filter((v): v is NonNullable<typeof v> => Boolean(v)))];
  if (templateIds.length === 0 && kinds.length === 0) return {};
  const appIds = [...new Set(docs.map((d) => d.application_id).filter((v): v is string => Boolean(v)))];

  const [templates, profile, templateNotes, profileNotes, countries, apps] = await Promise.all([
    templateIds.length
      ? supabase.from("document_templates").select(`id, ${GUIDE_COLUMNS}`).in("id", templateIds)
      : Promise.resolve({ data: [] as never[] }),
    kinds.length
      ? supabase.from("profile_document_guides").select(`kind, ${GUIDE_COLUMNS}`).in("kind", kinds)
      : Promise.resolve({ data: [] as never[] }),
    templateIds.length
      ? supabase.from("document_guide_country_notes").select("template_id, destination_id, note").in("template_id", templateIds)
      : Promise.resolve({ data: [] as never[] }),
    kinds.length
      ? supabase.from("document_guide_country_notes").select("profile_kind, destination_id, note").in("profile_kind", kinds)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("lead_destinations")
      .select("destination_id, is_backup, created_at, destination:destinations(display_name)")
      .eq("lead_id", studentId)
      .order("created_at", { ascending: true }),
    appIds.length
      ? supabase.from("applications").select("id, university:universities(destination_id)").in("id", appIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  // Primary first, then the backups in the order they were added.
  const studentCountries = ((countries.data ?? []) as { destination_id: string; is_backup: boolean | null; destination: unknown }[])
    .slice()
    .sort((a, b) => Number(Boolean(a.is_backup)) - Number(Boolean(b.is_backup)))
    .map((r) => ({ id: r.destination_id, name: (one(r.destination as never) as { display_name?: string } | null)?.display_name ?? "" }));
  const appCountry = new Map(
    ((apps.data ?? []) as { id: string; university: unknown }[]).map((a) => [
      a.id,
      (one(a.university as never) as { destination_id?: string } | null)?.destination_id ?? null,
    ])
  );

  const byTemplate = new Map(((templates.data ?? []) as (StoredGuide & { id: string })[]).map((t) => [t.id, t]));
  const byKind = new Map(((profile.data ?? []) as (StoredGuide & { kind: string })[]).map((g) => [g.kind, g]));
  const notesByTemplate = new Map<string, { destinationId: string; note: string }[]>();
  for (const n of (templateNotes.data ?? []) as { template_id: string; destination_id: string; note: string }[]) {
    notesByTemplate.set(n.template_id, [...(notesByTemplate.get(n.template_id) ?? []), { destinationId: n.destination_id, note: n.note }]);
  }
  const notesByKind = new Map<string, { destinationId: string; note: string }[]>();
  for (const n of (profileNotes.data ?? []) as { profile_kind: string; destination_id: string; note: string }[]) {
    notesByKind.set(n.profile_kind, [...(notesByKind.get(n.profile_kind) ?? []), { destinationId: n.destination_id, note: n.note }]);
  }

  // Each sample signed once, however many documents share its requirement.
  const samplePaths = [
    ...new Set([...byTemplate.values(), ...byKind.values()].map((g) => g.sample_file_path).filter((p): p is string => Boolean(p))),
  ];
  const signed = new Map<string, string>();
  await Promise.all(
    samplePaths.map(async (path) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
      if (data?.signedUrl) signed.set(path, data.signedUrl);
    })
  );

  const out: Record<string, ResolvedGuide> = {};
  for (const doc of docs) {
    const kind = profileGuideKind(doc.derived_key);
    const stored = doc.template_id ? byTemplate.get(doc.template_id) : kind ? byKind.get(kind) : undefined;
    const notes = doc.template_id ? notesByTemplate.get(doc.template_id) : kind ? notesByKind.get(kind) : undefined;
    const countryNotes = notesForStudent(notes ?? [], studentCountries, doc.application_id ? (appCountry.get(doc.application_id) ?? null) : null);
    if (!hasGuide(stored) && countryNotes.length === 0) continue;
    out[doc.id] = {
      note: stored?.description?.trim() || null,
      blocks: parseGuide(stored?.guide_body),
      sampleUrl: stored?.sample_file_path ? (signed.get(stored.sample_file_path) ?? null) : null,
      sampleName: stored?.sample_file_path ? (stored.sample_file_name ?? "Sample") : null,
      video: stored ? guideVideo(stored) : null,
      countryNotes,
    };
  }
  return out;
}
