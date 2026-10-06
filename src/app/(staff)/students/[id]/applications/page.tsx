import { hasRole } from "@/lib/auth/roles";
import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RefreshIfStale } from "@/components/RefreshIfStale";
import { orderCycles, cycleTabLabel, intakeLabel, type Cycle } from "@/lib/intakeCycle";
import { SuggestedPrograms, type Suggested } from "./SuggestedPrograms";
import { karachiToday } from "@/lib/calendarDates";
import { canSetService, serviceOf } from "@/lib/serviceType";
import { loadApplicationRows } from "@/lib/applicationRows";
import { orderedApplicationColumns } from "@/lib/applicationTable";
import { ApplicationsTable } from "@/app/(staff)/applications/ApplicationsTable";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentApplicationsTab(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { id } = await props.params;
  const { cycle: cycleParam } = await props.searchParams;
  const { supabase, staff: staffRow } = await getStaffSession();
  const isSuperAdmin = hasRole(staffRow, "super_admin");
  const canDelete = isSuperAdmin || hasRole(staffRow, "management");
  // A visa-only client (0279) already holds their admission: the way in is to
  // record it, not to apply for one.
  const { data: serviceRow } = await supabase.from("leads").select("service_type, full_name, student_code").eq("id", id).maybeSingle();
  const visaOnly = serviceOf(serviceRow?.service_type) === "visa_only";

  const [
    { rows: allRows, programsByUniversity },
    { data: destinationRows },
    { data: cycleRows },
    { data: interests },
    { data: suggestions },
    { data: savedOrder },
  ] = await Promise.all([
    loadApplicationRows(supabase, { studentId: id }),
    // The countries this student is registered for, and which of them are
    // backups. A backup country with nothing in it yet is still listed:
    // "we have not started Germany" is information.
    supabase
      .from("lead_destinations")
      .select("is_backup, destination:destinations(display_name, country_code)")
      .eq("lead_id", id),
    supabase
      .from("student_cycles")
      .select("id, sequence, intake, is_current")
      .eq("student_id", id)
      .order("sequence"),
    // What the student asked for, to say back to the reader beside the
    // suggestions — a list of programmes with no statement of why is a list
    // nobody can disagree with knowingly.
    supabase
      .from("students")
      .select("interest_field_groups, interest_core_fields, course_of_interest, level_applying_for")
      .eq("id", id)
      .maybeSingle(),
    // Programmes their interests point at, ranked, excluding anything already
    // applied for. One call; see 0245 for why this is not done in the app.
    supabase.rpc("suggested_programs", { lead: id, max_results: 25 }),
    supabase.from("list_column_orders").select("column_keys").eq("list_key", "applications").maybeSingle(),
  ]);

  const revalidateTo = `/students/${id}/applications`;

  // What the student asked for, in their own terms. course_of_interest is
  // already the trigger-rendered version of the same selections (0243), so it
  // is the readable form and needs no reassembling here.
  const interestGroups = (interests?.interest_field_groups ?? []) as string[];
  const interestSpecifics = (interests?.interest_core_fields ?? []) as string[];
  const interestCount = interestGroups.length + interestSpecifics.length;
  const interestSummary =
    (interests?.course_of_interest ?? "").trim() ||
    (interestCount > 0 ? `${interestCount} chosen field${interestCount === 1 ? "" : "s"}` : "their course of interest");

  // One tab per intake the student has been through, the current one first.
  // A student who has only gone round once — almost all of them — gets no
  // intake strip at all.
  const cycles = orderCycles((cycleRows ?? []) as Cycle[]);
  const showCycleTabs = cycles.length > 1;
  const currentCycleId = cycles.find((c) => c.is_current)?.id ?? cycles[0]?.id ?? null;
  const activeCycleId =
    showCycleTabs && cycleParam && cycles.some((c) => c.id === cycleParam) ? cycleParam : currentCycleId;
  // An application raised before cycles existed belongs to the first attempt.
  const firstCycleId = cycles.at(-1)?.id ?? null;
  const activeCycle = cycles.find((c) => c.id === activeCycleId) ?? null;
  const isPreviousIntake = Boolean(activeCycle && !activeCycle.is_current);

  // Only the intake being looked at. Numbering, the finalize lock and the
  // priority order are all per intake: last year's finalised university must
  // not lock this year's, and "application #3" has to mean the third one of
  // this attempt — in the priority staff set, as the cards numbered them.
  const rows = allRows
    .filter((r) => !showCycleTabs || (r.cycleId ?? firstCycleId) === activeCycleId)
    .map((r) => ({ ...r, cycleId: r.cycleId ?? firstCycleId }));
  [...rows]
    .sort((x, y) => (x.sortOrder ?? Number.MAX_SAFE_INTEGER) - (y.sortOrder ?? Number.MAX_SAFE_INTEGER) || x.createdAt.localeCompare(y.createdAt))
    .forEach((r, i) => (r.number = i + 1));

  // The countries, primary first, then backups, then any country with
  // applications that is no longer on the student's list — each with how many
  // applications it has in this intake.
  const registered = (destinationRows ?? [])
    .map((r) => {
      const dest = one(r.destination as never) as { display_name?: string; country_code?: string } | null;
      return { code: dest?.country_code ?? "", name: dest?.display_name ?? "", isBackup: Boolean(r.is_backup) };
    })
    .filter((r) => r.code)
    .sort((a, b) => Number(a.isBackup) - Number(b.isBackup) || a.name.localeCompare(b.name));
  const countries = [
    ...registered,
    ...[...new Set(rows.map((r) => r.countryCode ?? ""))]
      .filter((code) => code && !registered.some((r) => r.code === code))
      .map((code) => ({ code, name: rows.find((r) => r.countryCode === code)?.country ?? code, isBackup: false })),
  ].map((c) => ({ ...c, count: rows.filter((r) => r.countryCode === c.code).length }));

  const columns = orderedApplicationColumns(savedOrder?.column_keys, "student").map((c) => ({ key: c.key, header: c.header }));

  return (
    <div>
      <RefreshIfStale renderKey={crypto.randomUUID()} />
      {visaOnly && (
        <div data-record-admission>
        <Card className="mb-4 border-info">
          <p className="text-sm font-medium text-ink">Visa documentation &amp; application only</p>
          <p className="mt-1 text-sm text-muted">
            This client already holds an admission. Record it — the university, the programme and the admission letter — and the
            visa work can start; there is nothing to apply for.
          </p>
          {canSetService(staffRow) ? (
            <Link
              prefetch={false}
              href={`/students/${id}/applications/record-admission`}
              className="mt-3 inline-block w-fit rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink hover:opacity-90"
            >
              Record their admission
            </Link>
          ) : (
            <p className="mt-2 text-xs text-muted">The processing team records it.</p>
          )}
        </Card>
        </div>
      )}
      {/* One tab per intake, the upcoming one first and the previous year
          second, as the office asked. Only when there is more than one. */}
      {showCycleTabs && (
        <div className="mb-4 flex flex-wrap gap-2">
          {cycles.map((c) => (
            <Link
              prefetch={false}
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted">
            {rows.length} applications
            {showCycleTabs && activeCycle ? ` · ${intakeLabel(activeCycle.intake)}` : ""}
          </p>
          {countries.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" data-country-summary>
              {countries.map((c) => (
                <span key={c.code} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-ink">
                  {c.name}
                  {c.isBackup && <span className="ml-1 text-muted">(backup)</span>}
                  <span className="ml-1.5 tabular-nums text-muted">{c.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {/* A closed intake takes no new applications — an application added to
            last year would quietly reopen work that is finished. */}
        {!isPreviousIntake && (
          <Link prefetch={false} href={`/students/${id}/applications/new`} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
            + Add application
          </Link>
        )}
      </div>

      {/* Suggestions sit above the list and only for the intake being worked:
          a closed intake is a record, and recommending new applications into
          it would invite reopening finished work. */}
      {!isPreviousIntake && (
        <SuggestedPrograms
          studentId={id}
          revalidateTo={revalidateTo}
          suggestions={(suggestions ?? []) as Suggested[]}
          hasInterests={interestCount > 0}
          interestSummary={interestSummary}
        />
      )}

      {isPreviousIntake && (
        <p className="mb-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          This is a previous intake, kept for reference. The student&rsquo;s current work is under{" "}
          <strong className="font-medium text-ink">{cycleTabLabel("Apps", cycles[0])}</strong>.
        </p>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState>
            {isPreviousIntake ? "Nothing was applied for in this intake." : "No applications yet."}
          </EmptyState>
        </Card>
      ) : (
        <ApplicationsTable
          rows={rows}
          programsByUniversity={programsByUniversity}
          columns={columns}
          scope="student"
          today={karachiToday()}
          canEditCatalogue={isSuperAdmin}
          canDelete={canDelete}
          readOnly={isPreviousIntake}
          exportHref={`/api/export/applications?student=${id}${showCycleTabs && activeCycleId ? `&cycle=${activeCycleId}` : ""}`}
          label={`Applications — ${serviceRow?.full_name ?? "student"}`}
          // Expanded, the student's name and ID are no longer on screen: said above the table.
          heading={{
            title: `${serviceRow?.full_name ?? "Student"} — Applications`,
            detail: [serviceRow?.student_code, activeCycle ? intakeLabel(activeCycle.intake) : null, `${rows.length} applications`]
              .filter(Boolean)
              .join(" · "),
          }}
        />
      )}
    </div>
  );
}
