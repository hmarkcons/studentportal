import Link from "next/link";
import { requireReportAccess } from "@/lib/auth/reportAccess";
import { categorizeApplicationStage } from "@/lib/applicationStage";
import { DataTable } from "@/components/ui/DataTable";

type Row = {
  id: string;
  name: string;
  destination: string;
  total: number;
  offers: number;
  rejected: number;
  inProgress: number;
  closed: number;
  successPct: number | null;
};

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function UniversitySuccessPage() {
  const { supabase } = await requireReportAccess("/reports/university-success");

  // pipeline_stages comes along because stage names are configured per
  // destination and this report cannot be written against fixed ones. It was:
  // enrolled counted as success, ["rejected", "declined"] as failure.
  //
  // "enrolled" exists in only 6 of the 20 destination pipelines. The other 14 —
  // Italy, France, Germany, the UK, the US, Canada, Australia and more — end at
  // acceptance_letter, coe, cas_letter, i20_letter, loa or invitation_letter and
  // never reach a stage by that name, so for most of the business the Enrolled
  // column and the success rate could only ever read zero.
  //
  // categorizeApplicationStage is the destination-agnostic helper written for
  // exactly this: it treats anything past under_review in that destination's own
  // pipeline as an offer, whatever the stage happens to be called.
  const { data: applications } = await supabase
    .from("applications")
    .select("current_stage, university:universities(id, name, destination:destinations(display_name, pipeline_stages))");

  const byUni = new Map<string, Omit<Row, "successPct">>();
  for (const a of applications ?? []) {
    const uni = one(a.university) as
      | { id: string; name: string; destination: { display_name?: string; pipeline_stages?: string[] } | null }
      | null;
    if (!uni) continue;
    const destination = one(uni.destination as never) as { display_name?: string; pipeline_stages?: string[] } | null;
    const stages = Array.isArray(destination?.pipeline_stages) ? destination!.pipeline_stages! : [];

    const entry =
      byUni.get(uni.id) ??
      { id: uni.id, name: uni.name, destination: destination?.display_name ?? "—", total: 0, offers: 0, rejected: 0, inProgress: 0, closed: 0 };
    entry.total += 1;

    switch (categorizeApplicationStage(a.current_stage, stages)) {
      case "with_offer":
        entry.offers += 1;
        break;
      case "rejected":
        entry.rejected += 1;
        break;
      // Not eligible and withdrawn are neither a win nor a university saying
      // no, so they are counted apart and kept out of the rate rather than
      // quietly dragging it down.
      case "not_eligible":
      case "withdrawn":
        entry.closed += 1;
        break;
      default:
        entry.inProgress += 1;
    }
    byUni.set(uni.id, entry);
  }

  // Rate over decided applications only, and null — not 0% — when none has been
  // decided, so a university with two applications still under review does not
  // appear to have failed both. Busiest first: a 100% rate off one application
  // says nothing and should not head the table.
  const rows: Row[] = [...byUni.values()]
    .map((v) => {
      const decided = v.offers + v.rejected;
      return { ...v, successPct: decided ? Math.round((v.offers / decided) * 100) : null };
    })
    .sort((a, b) => b.offers + b.rejected - (a.offers + a.rejected) || b.total - a.total);

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-1 text-lg font-semibold text-ink">University-wise Application / Success Rate</h2>
      <p className="mb-4 text-sm text-muted">
        An application counts as successful once it reaches an offer or acceptance in that destination&rsquo;s own
        pipeline &mdash; the final stage is named differently per country. The rate covers decided applications only, so
        ones still in progress neither help nor hurt it.
      </p>
      <DataTable
        exportFilename="university-success"
        columns={[
          { key: "name", header: "University" },
          { key: "destination", header: "Destination" },
          { key: "total", header: "Applications", align: "right" },
          { key: "offers", header: "Offer / acceptance", align: "right" },
          { key: "rejected", header: "Rejected", align: "right" },
          { key: "inProgress", header: "In progress", align: "right" },
          { key: "closed", header: "Withdrawn / not eligible", align: "right" },
          { key: "rate", header: "Success rate", align: "right" },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          cells: {
            name: r.name,
            destination: r.destination,
            total: r.total,
            offers: r.offers,
            rejected: r.rejected,
            inProgress: r.inProgress,
            closed: r.closed,
            rate: r.successPct === null ? "—" : `${r.successPct}%`,
          },
          csv: {
            name: r.name,
            destination: r.destination,
            total: String(r.total),
            offers: String(r.offers),
            rejected: String(r.rejected),
            inProgress: String(r.inProgress),
            closed: String(r.closed),
            rate: r.successPct === null ? "" : String(r.successPct),
          },
        }))}
      />
    </div>
  );
}
