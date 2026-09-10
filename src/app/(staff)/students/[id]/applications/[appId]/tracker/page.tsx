import { redirect } from "next/navigation";

/**
 * There is one documentation tracker per country, on the student's dashboard.
 *
 * This page was a second one, per application, and it wrote its answers
 * against that application's id. The dashboard reads one application per
 * country — the earliest — so anything filled in here from any other
 * application at the same university was stored somewhere nothing displays.
 * Five students on file have two or three applications in one country, so it
 * was a live way to lose an afternoon's work.
 *
 * The scholarship half of this page was never unique to it either: the
 * Scholarship tab renders the same ScholarshipSection for every application,
 * which is where it belongs.
 *
 * Kept as a redirect rather than deleted, because the link lived on every
 * application page and will be in people's history.
 */
export default async function CountryTrackerPage(props: PageProps<"/students/[id]/applications/[appId]/tracker">) {
  const { id } = await props.params;
  redirect(`/students/${id}`);
}
