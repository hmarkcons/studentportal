import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { formatDateOnly } from "@/lib/formatDate";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { DeleteApplicationButton } from "./DeleteApplicationButton";
import { FinalizeApplicationButton } from "./FinalizeApplicationButton";
import { ApplicationOrderList } from "./ApplicationOrderList";
import { orderCycles, cycleTabLabel, intakeLabel, type Cycle } from "@/lib/intakeCycle";
import { applicationDeadline, deadlineSource, daysUntil } from "@/lib/applicationDeadline";
import { ROUND_DATE_FORMAT } from "@/lib/programRounds";
import { karachiToday } from "@/lib/calendarDates";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentApplicationsTab(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ country?: string; cycle?: string }>;
}) {
  const { id } = await props.params;
  const { country: countryParam, cycle: cycleParam } = await props.searchParams;
  const { supabase, staff: staffRow } = await getStaffSession();
  const canDelete = staffRow?.role === "super_admin" || staffRow?.role === "management";

  const [{ data: applications }, { data: destinationRows }, { data: cycleRows }] = await Promise.all([
    supabase
      .from("applications")
      .select(
        `id, current_stage, intake, deadline, is_finalized, cycle_id, round_id,
       university:universities(name, destination:destinations(display_name, country_code, pipeline_stages, finalize_action_label, finalized_badge_label)),
       program:programs(name, application_deadline, rounds:program_intake_rounds(id)),
       round:program_intake_rounds(label, start_date, application_deadline)`
      )
      .eq("student_id", id)
      // The priority staff set, then creation order for anything that somehow
      // has no position yet — nullsFirst:false so an unpositioned application
      // lands at the bottom rather than jumping to the top of the list (0171).
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    // The countries this student is registered for, and which of them are
    // backups. A backup country with nothing in it yet is worth a visible,
    // empty tab: "we have not started Germany" is information.
    supabase
      .from("lead_destinations")
      .select("is_backup, destination:destinations(display_name, country_code)")
      .eq("lead_id", id),
    supabase
      .from("student_cycles")
      .select("id, sequence, intake, is_current")
      .eq("student_id", id)
      .order("sequence"),
  ]);

  const revalidateTo = `/students/${id}/applications`;

  // Karachi's business day, read once on the server — a deadline is overdue on
  // the office's calendar, not the viewer's, and no component may read the
  // clock during render.
  const today = karachiToday();

  // One tab per intake the student has been through, the current one first.
  // A student who has only gone round once — almost all of them — gets no
  // intake strip at all, and this page looks exactly as it did.
  const cycles = orderCycles((cycleRows ?? []) as Cycle[]);
  const showCycleTabs = cycles.length > 1;
  const currentCycleId = cycles.find((c) => c.is_current)?.id ?? cycles[0]?.id ?? null;
  const activeCycleId =
    showCycleTabs && cycleParam && cycles.some((c) => c.id === cycleParam) ? cycleParam : currentCycleId;
  // An application raised before cycles existed belongs to the first attempt.
  const firstCycleId = cycles.at(-1)?.id ?? null;
  const inActiveCycle = (appCycleId: string | null) =>
    !showCycleTabs || (appCycleId ?? firstCycleId) === activeCycleId;
  const activeCycle = cycles.find((c) => c.id === activeCycleId) ?? null;
  const isPreviousIntake = Boolean(activeCycle && !activeCycle.is_current);

  // Only the intake being looked at. Numbering, the finalize lock and the
  // country tabs are all per intake: last year's finalised university must not
  // lock this year's, and "application #3" has to mean the third one of this
  // attempt.
  const cycleApplications = (applications ?? []).filter((a) => inActiveCycle(a.cycle_id ?? null));

  // One running number across every application (not per country group), so
  // "application #3" means the same thing wherever it's referred to. Numbered
  // in creation order, which the query above already sorts by.
  const numberById = new Map(cycleApplications.map((a, i) => [a.id, i + 1]));

  // Once one university is finalized, Finalize is locked on the rest until
  // that one is un-finalized.
  const hasFinalized = cycleApplications.some((a) => a.is_finalized);

  // Grouped by country code rather than display name, so the tab in the URL
  // is stable and does not carry a country's name in it.
  const UNASSIGNED = "unassigned";
  const byCountry = new Map<string, NonNullable<typeof applications>>();
  const nameByCode = new Map<string, string>();
  for (const a of cycleApplications) {
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
      {/* One tab per intake, the upcoming one first and the previous year
          second, as the office asked. Only when there is more than one. */}
      {showCycleTabs && (
        <div className="mb-4 flex flex-wrap gap-2">
          {cycles.map((c) => (
            <Link
              key={c.id}
              href={`/students/${id}/applications?cycle=${c.id}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                c.id === activeCycleId
                  ? "bg-primary text-primary-ink"
                  : "border border-border text-muted hover:text-ink"
              }`}
            >
              {cycleTabLabel("Apps", c)}
              {!c.is_current && <span className="ml-1.5 text-xs font-normal opacity-80">previous</span>}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {cycleApplications.length} applications
          {showCycleTabs && activeCycle ? ` · ${intakeLabel(activeCycle.intake)}` : ""}
        </p>
        {/* A closed intake takes no new applications — an application added to
            last year would quietly reopen work that is finished. */}
        {!isPreviousIntake && (
          <Link href={`/students/${id}/applications/new`} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
            + Add application
          </Link>
        )}
      </div>

      {isPreviousIntake && (
        <p className="mb-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          This is a previous intake, kept for reference. The student&rsquo;s current work is under{" "}
          <strong className="font-medium text-ink">{cycleTabLabel("Apps", cycles[0])}</strong>.
        </p>
      )}

      {cycleApplications.length === 0 && !showTabs && (
        <Card>
          <EmptyState>
            {isPreviousIntake ? "Nothing was applied for in this intake." : "No applications yet."}
          </EmptyState>
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
              href={`/students/${id}/applications?country=${t.code}${activeCycleId ? `&cycle=${activeCycleId}` : ""}`}
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
          <ApplicationOrderList
            studentId={id}
            canEdit={!isPreviousIntake}
            applications={(apps ?? []).map((a) => {
              const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
              const dest = uni?.destination
                ? (one(uni.destination as never) as {
                    pipeline_stages?: string[];
                    country_code?: string;
                    finalize_action_label?: string;
                    finalized_badge_label?: string;
                  } | null)
                : null;
              const program = one(a.program as never) as
                | { name?: string; application_deadline?: string | null; rounds?: { id: string }[] }
                | null;
              const round = one(a.round as never) as
                | { label?: string; start_date?: string | null; application_deadline?: string | null }
                | null;

              // The effective deadline, and which of the three sources it came
              // from. This line used to print a.deadline alone, so an
              // application whose date comes from its intake round — or from
              // the programme catalogue — read "No deadline set" while the
              // reminder cron and the calendar were both acting on a real
              // date. Saying which source it is matters too: a date somebody
              // typed for this student is a commitment, a catalogue date is a
              // default.
              const due = applicationDeadline(a.deadline, round?.application_deadline, program?.application_deadline);
              const source = deadlineSource(a.deadline, round?.application_deadline, program?.application_deadline);
              const when = due ? formatDateOnly(due, ROUND_DATE_FORMAT) : null;
              const overdue = due ? daysUntil(due, today) < 0 : false;
              const deadlineText = !when
                ? "No deadline set"
                : source === "application"
                  ? `Deadline: ${when}`
                  : source === "round"
                    ? `${round?.label ?? "Round"} ${overdue ? "closed" : "closes"} ${when}`
                    : `Programme deadline ${when}`;

              const roundCount = program?.rounds?.length ?? 0;

              const orderableStage = a.current_stage;
              const number = numberById.get(a.id) ?? 0;
              // Banded like a spreadsheet so adjacent applications don't blur
              // together — tinted with the brand green rather than plain grey.
              const banded = number % 2 === 0;
              return {
                id: a.id,
                universityName: uni?.name ?? "University",
                programName: program?.name ?? null,
                stage: orderableStage,
                card: (
                <div
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
                  {/* Which intake round this application is for. Only where
                      the programme actually runs rounds — most do not, and a
                      "no round chosen" note on a programme that has none would
                      be asking for something that does not exist. */}
                  {roundCount > 0 && (
                    <div className="mt-1 px-1 text-xs text-muted">
                      {round?.label ? (
                        <>
                          Round: <span className="font-medium text-ink">{round.label}</span>
                          {round.start_date && <> · starts {formatDateOnly(round.start_date, ROUND_DATE_FORMAT)}</>}
                        </>
                      ) : (
                        <span className="text-warning">
                          No round chosen — {roundCount} to pick from
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between px-1">
                    <span className="text-xs text-muted">
                      <span className={overdue ? "font-medium text-danger" : ""}>{deadlineText}</span>
                      {" · "}
                      <Badge tone="info">{a.current_stage.replace(/_/g, " ")}</Badge>
                      {a.is_finalized && (
                        <>
                          {" · "}
                          <Badge tone="success">{dest?.finalized_badge_label ?? "Finalized for visa"}</Badge>
                        </>
                      )}
                    </span>
                    {/* A closed intake is a record, not a workspace: nothing
                        about it can be finalised or deleted from here. */}
                    {!isPreviousIntake && (
                      <div className="flex items-center gap-2">
                        <FinalizeApplicationButton
                          applicationId={a.id}
                          studentId={id}
                          revalidateTo={revalidateTo}
                          isFinalized={a.is_finalized}
                          actionLabel={dest?.finalize_action_label ?? undefined}
                          badgeLabel={dest?.finalized_badge_label ?? undefined}
                          blockedByOther={hasFinalized && !a.is_finalized}
                        />
                        {canDelete && (
                          <DeleteApplicationButton applicationId={a.id} revalidateTo={revalidateTo} label={uni?.name ?? "this university"} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
                ),
              };
            })}
          />
        </div>
        );
      })}
    </div>
  );
}
