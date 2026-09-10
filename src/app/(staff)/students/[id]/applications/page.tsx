import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { formatDateOnly } from "@/lib/formatDate";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { DeleteApplicationButton } from "./DeleteApplicationButton";
import { FinalizeApplicationButton } from "./FinalizeApplicationButton";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentApplicationsTab(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const { id } = await props.params;
  const { country: countryParam } = await props.searchParams;
  const { supabase, staff: staffRow } = await getStaffSession();
  const canDelete = staffRow?.role === "super_admin" || staffRow?.role === "management";

  const [{ data: applications }, { data: destinationRows }] = await Promise.all([
    supabase
      .from("applications")
      .select(
        `id, current_stage, intake, deadline, is_finalized,
       university:universities(name, destination:destinations(display_name, country_code, pipeline_stages)),
       program:programs(name)`
      )
      .eq("student_id", id)
      .order("created_at", { ascending: true }),
    // The countries this student is registered for, and which of them are
    // backups. A backup country with nothing in it yet is worth a visible,
    // empty tab: "we have not started Germany" is information.
    supabase
      .from("lead_destinations")
      .select("is_backup, destination:destinations(display_name, country_code)")
      .eq("lead_id", id),
  ]);

  const revalidateTo = `/students/${id}/applications`;

  // One running number across every application (not per country group), so
  // "application #3" means the same thing wherever it's referred to. Numbered
  // in creation order, which the query above already sorts by.
  const numberById = new Map((applications ?? []).map((a, i) => [a.id, i + 1]));

  // Once one university is finalized, Finalize is locked on the rest until
  // that one is un-finalized.
  const hasFinalized = (applications ?? []).some((a) => a.is_finalized);

  // Grouped by country code rather than display name, so the tab in the URL
  // is stable and does not carry a country's name in it.
  const UNASSIGNED = "unassigned";
  const byCountry = new Map<string, NonNullable<typeof applications>>();
  const nameByCode = new Map<string, string>();
  for (const a of applications ?? []) {
    const uni = one(a.university as never) as { destination?: unknown } | null;
    const dest = uni?.destination
      ? (one(uni.destination as never) as { display_name?: string; country_code?: string } | null)
      : null;
    const code = dest?.country_code ?? UNASSIGNED;
    nameByCode.set(code, dest?.display_name ?? "No country set");
    if (!byCountry.has(code)) byCountry.set(code, []);
    byCountry.get(code)!.push(a);
  }

  // One tab per country the student is registered for, primary first, then
  // backups — plus any country that has applications but is no longer on the
  // student's list, which would otherwise be unreachable.
  const registered = (destinationRows ?? [])
    .map((r) => {
      const dest = one(r.destination as never) as { display_name?: string; country_code?: string } | null;
      return { code: dest?.country_code ?? "", name: dest?.display_name ?? "", isBackup: Boolean(r.is_backup) };
    })
    .filter((r) => r.code);
  for (const r of registered) if (!nameByCode.has(r.code)) nameByCode.set(r.code, r.name);

  const ordered = [
    ...registered.filter((r) => !r.isBackup).sort((a, b) => a.name.localeCompare(b.name)),
    ...registered.filter((r) => r.isBackup).sort((a, b) => a.name.localeCompare(b.name)),
  ];
  const registeredCodes = new Set(ordered.map((r) => r.code));
  const extras = Array.from(byCountry.keys())
    .filter((code) => !registeredCodes.has(code))
    .map((code) => ({ code, name: nameByCode.get(code) ?? code, isBackup: false }));

  const tabs = [...ordered, ...extras].map((t) => ({
    ...t,
    count: (byCountry.get(t.code) ?? []).length,
  }));

  // A single country needs no tab strip — it would be one button above the
  // only thing it could show.
  const showTabs = tabs.length > 1;
  const activeCode =
    showTabs && countryParam && tabs.some((t) => t.code === countryParam)
      ? countryParam
      : // Default to the first tab that actually has applications, so opening
        // the page never lands on an empty backup country.
        (tabs.find((t) => t.count > 0)?.code ?? tabs[0]?.code ?? UNASSIGNED);

  const visibleCodes = showTabs ? [activeCode] : Array.from(byCountry.keys());

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{applications?.length ?? 0} applications</p>
        <Link href={`/students/${id}/applications/new`} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          + Add application
        </Link>
      </div>

      {(!applications || applications.length === 0) && !showTabs && (
        <Card>
          <EmptyState>No applications yet.</EmptyState>
        </Card>
      )}

      {/* One sub-tab per destination. A student registered for a primary
          country and one or two backups had every country's applications in
          one long stack; each is now its own tab, with the primary first and
          backups marked as such. */}
      {showTabs && (
        <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
          {tabs.map((t) => (
            <Link
              key={t.code}
              href={`/students/${id}/applications?country=${t.code}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                t.code === activeCode ? "bg-primary text-primary-ink" : "border border-border text-muted hover:text-ink"
              }`}
            >
              {nameByCode.get(t.code) ?? t.code}
              {t.isBackup && <span className="ml-1 font-normal opacity-80">(backup)</span>}
              <span className="ml-1.5 font-normal opacity-80">{t.count}</span>
            </Link>
          ))}
        </div>
      )}

      {visibleCodes.map((code) => {
        const apps = byCountry.get(code) ?? [];
        return (
        <div key={code} className="mb-6">
          {!showTabs && (
            <h3 className="mb-3 text-sm font-medium text-ink">Applications — {nameByCode.get(code) ?? code}</h3>
          )}
          {apps.length === 0 && (
            <Card>
              <EmptyState>
                Nothing applied for in {nameByCode.get(code) ?? "this country"} yet.
              </EmptyState>
            </Card>
          )}
          <div className="flex flex-col gap-4">
            {(apps ?? []).map((a) => {
              const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
              const dest = uni?.destination
                ? (one(uni.destination as never) as { pipeline_stages?: string[]; country_code?: string } | null)
                : null;
              const program = one(a.program as never) as { name?: string } | null;
              const isItaly = dest?.country_code === "IT";
              const number = numberById.get(a.id) ?? 0;
              // Banded like a spreadsheet so adjacent applications don't blur
              // together — tinted with the brand green rather than plain grey.
              const banded = number % 2 === 0;
              return (
                <div
                  key={a.id}
                  className={`rounded-xl p-2 ${banded ? "bg-[color-mix(in_srgb,var(--primary)_7%,transparent)]" : "bg-transparent"}`}
                >
                  <div className="mb-1 flex items-center gap-2 px-1">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-ink">
                      {number}
                    </span>
                    <span className="text-xs font-medium text-muted">Application #{number}</span>
                  </div>
                  <Link href={`/students/${id}/applications/${a.id}`} className="block">
                    <BoardingPassTracker
                      universityName={uni?.name ?? "University"}
                      programName={program?.name}
                      intake={a.intake}
                      currentStage={a.current_stage}
                      pipelineStages={dest?.pipeline_stages ?? []}
                    />
                  </Link>
                  <div className="mt-1 flex items-center justify-between px-1">
                    <span className="text-xs text-muted">
                      {a.deadline ? `Deadline: ${formatDateOnly(a.deadline)}` : "No deadline set"}
                      {" · "}
                      <Badge tone="info">{a.current_stage.replace(/_/g, " ")}</Badge>
                      {a.is_finalized && (
                        <>
                          {" · "}
                          <Badge tone="success">{isItaly ? "Pre-Enrolled" : "Finalized for visa"}</Badge>
                        </>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <FinalizeApplicationButton
                        applicationId={a.id}
                        studentId={id}
                        revalidateTo={revalidateTo}
                        isFinalized={a.is_finalized}
                        countryCode={dest?.country_code}
                        blockedByOther={hasFinalized && !a.is_finalized}
                      />
                      {canDelete && (
                        <DeleteApplicationButton applicationId={a.id} revalidateTo={revalidateTo} label={uni?.name ?? "this university"} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}
