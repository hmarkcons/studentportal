"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { LongTextCell } from "@/components/ui/LongTextCell";
import { SafeLink } from "@/components/SafeLink";
import { EmailLinks } from "@/components/EmailLinks";
import { markListsStale } from "@/components/RefreshIfStale";
import { toast } from "@/lib/toast";
import { RemarkCell } from "../leads/RemarkCell";
import type { RemarkStore } from "../leads/LeadRemarkEditor";
import {
  listApplicationRemarks,
  saveApplicationCell,
  saveApplicationOrder,
  saveApplicationRemark,
  type ApplicationCell,
} from "@/lib/actions/applicationTable";
import { deleteApplication } from "@/lib/actions/applications";
import type { ApplicationRow, ProgramOption } from "@/lib/applicationRows";
import { compareApplications, GROUP_LABEL, stageGroup, stageLabel, type ApplicationColumnKey, type StageGroup } from "@/lib/applicationTable";
import { applicationCellText } from "@/lib/applicationText";
import { formatFee } from "@/lib/applicationFee";
import { daysUntil } from "@/lib/applicationDeadline";
import { formatDateOnly } from "@/lib/formatDate";
import { ROUND_DATE_FORMAT } from "@/lib/programRounds";
import { ChoiceCell, FinalizeCell, PriorityCell, StageCell, TextCell } from "./ApplicationCells";

const APPLICATION_REMARKS: RemarkStore = {
  list: listApplicationRemarks,
  save: saveApplicationRemark,
  placeholder: "e.g. Waiting on the bank letter before submitting",
};

const GROUPS: StageGroup[] = ["accepted", "progress", "closed", "rejected"];
const GROUP_DOT: Record<StageGroup, string> = {
  accepted: "bg-success",
  progress: "bg-info",
  closed: "bg-muted",
  rejected: "bg-danger",
};

/**
 * When a change was saved, in order: a change saved after the rows were last
 * asked for is kept over them. A count, not the clock — only the order matters.
 */
let stamp = 0;
const nextStamp = () => ++stamp;

/** A saved change, shown over the server's row until the server sends the row again. */
type Edit = { patch: Partial<ApplicationRow>; at: number };

const sortable = (r: ApplicationRow) => ({ stage: r.stage, pipeline: r.pipeline, studentName: r.studentName, sortOrder: r.sortOrder, createdAt: r.createdAt });
const intakeOf = (r: ApplicationRow) => `${r.studentId}|${r.cycleId ?? ""}`;

/**
 * The staff's applications, as a table like the leads list: one application
 * a row, every column of it editable where it stands, coloured by stage —
 * offers green at the top, rejections red at the bottom, withdrawn greyed
 * above them.
 *
 * The all-applications page and a student's Applications tab both draw it;
 * the student's own portal keeps its own design and is untouched by this.
 *
 * A cell saves on its own and shows what it saved straight away; the rows are
 * then read again behind it, for what the save changed elsewhere — the
 * effective deadline, a finalised stage, a programme's links on every row of
 * that programme.
 */
export function ApplicationsTable({
  rows,
  programsByUniversity,
  columns,
  scope,
  today,
  canEditCatalogue,
  canDelete,
  readOnly = false,
  exportHref,
  label,
  heading,
}: {
  rows: ApplicationRow[];
  programsByUniversity: Record<string, ProgramOption[]>;
  /** In the order a Super Admin arranged them (0319). */
  columns: { key: ApplicationColumnKey; header: string }[];
  scope: "all" | "student";
  /** Karachi's date, read by the server: what "3 days left" counts from. */
  today: string;
  /** A Super Admin: the programme's links and emails are the catalogue's, theirs to change. */
  canEditCatalogue: boolean;
  canDelete: boolean;
  /** A previous intake: a record, not a workspace. */
  readOnly?: boolean;
  exportHref: string;
  label: string;
  /** Said above the table when it is expanded: whose applications these are. */
  heading: { title: string; detail?: string | null };
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [group, setGroup] = useState<StageGroup | "">("");

  // A fresh read from the server holds every save that finished before it was
  // asked for; a save still on its way, or finished since, is kept over it.
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setEdits((all) => Object.fromEntries(Object.entries(all).filter(([, e]) => e.at > refreshedAt)));
  }

  const merged = useMemo(
    () =>
      rows
        .filter((r) => !gone.has(r.id))
        .map((r) => (edits[r.id] ? { ...r, ...edits[r.id].patch } : r))
        .sort((a, b) => compareApplications(sortable(a), sortable(b))),
    [rows, edits, gone]
  );

  const counts = useMemo(() => {
    const c: Record<StageGroup, number> = { accepted: 0, progress: 0, closed: 0, rejected: 0 };
    for (const r of merged) c[stageGroup(r.stage, r.pipeline)]++;
    return c;
  }, [merged]);

  function patchRow(id: string, patch: Partial<ApplicationRow>, at: number) {
    setEdits((all) => ({ ...all, [id]: { patch: { ...all[id]?.patch, ...patch }, at } }));
  }

  /** Reads the rows again in the background, for what a save changed beyond its own cell. */
  function refresh(at: number) {
    setRefreshedAt(at);
    startRefresh(() => router.refresh());
  }

  async function save(
    row: ApplicationRow,
    cell: ApplicationCell,
    value: string | boolean | null,
    patch: Partial<ApplicationRow>,
    { reread = true, saved = "Saved." }: { reread?: boolean; saved?: string } = {}
  ): Promise<boolean> {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, row[k as keyof ApplicationRow]])) as Partial<ApplicationRow>;
    patchRow(row.id, patch, Infinity);
    const result = await saveApplicationCell(row.id, cell, value);
    const now = nextStamp();
    if ("error" in result) {
      patchRow(row.id, before, now);
      toast(result.error, "danger");
      return false;
    }
    patchRow(row.id, {}, now);
    // The list held for Back no longer shows this row as it is.
    markListsStale();
    if (reread) refresh(now);
    toast(saved);
    return true;
  }

  async function saveStage(row: ApplicationRow, stage: string) {
    const was = stageGroup(row.stage, row.pipeline);
    const now = stageGroup(stage, row.pipeline);
    const moved =
      now === was
        ? "Stage saved."
        : now === "rejected"
          ? "Rejected — moved to the bottom of the list."
          : now === "accepted"
            ? "An offer — moved to the top of the list."
            : `Stage saved — now under ${GROUP_LABEL[now]}.`;
    return save(row, "stage", stage, { stage }, { saved: moved });
  }

  async function move(row: ApplicationRow, direction: "up" | "down") {
    // The student's applications in this intake, as the table shows them.
    const siblings = merged.filter((r) => intakeOf(r) === intakeOf(row));
    const at = siblings.findIndex((r) => r.id === row.id);
    const to = direction === "up" ? at - 1 : at + 1;
    if (at < 0 || to < 0 || to >= siblings.length) return;
    const order = siblings.map((r) => r.id);
    [order[at], order[to]] = [order[to], order[at]];
    const before = siblings.map((r) => ({ id: r.id, sortOrder: r.sortOrder, number: r.number }));
    order.forEach((id, i) => patchRow(id, { sortOrder: (i + 1) * 10, number: i + 1 }, Infinity));
    const result = await saveApplicationOrder(row.studentId, order);
    const now = nextStamp();
    if ("error" in result) {
      for (const b of before) patchRow(b.id, { sortOrder: b.sortOrder, number: b.number }, now);
      toast(result.error, "danger");
      return;
    }
    for (const id of order) patchRow(id, {}, now);
    markListsStale();
  }

  async function remove(row: ApplicationRow) {
    if (!confirm(`Delete the application to ${row.universityName}? This also deletes its documents, tasks, and visa record.`)) return;
    const result = await deleteApplication(row.id, scope === "student" ? `/students/${row.studentId}/applications` : "/applications");
    if (result && "error" in result && result.error) {
      toast(result.error, "danger");
      return;
    }
    setGone((g) => new Set(g).add(row.id));
    markListsStale();
    toast("Deleted.");
  }

  const tableRows = useMemo(() => {
    // Which application of each intake is finalised: the rest wait for it to be undone.
    const finalizedIn = new Map<string, string>();
    for (const r of merged) if (r.finalized) finalizedIn.set(intakeOf(r), r.id);

    const shown = group ? merged.filter((r) => stageGroup(r.stage, r.pipeline) === group) : merged;
    return shown.map((r, index) => {
      const g = stageGroup(r.stage, r.pipeline);
      const programs = programsByUniversity[r.universityId] ?? [];
      const program = programs.find((p) => p.id === r.programId) ?? null;
      const rounds = program?.rounds ?? [];
      const locked = readOnly;
      const neighbour = (d: -1 | 1) => {
        const next = shown[index + d];
        return Boolean(next && intakeOf(next) === intakeOf(r) && stageGroup(next.stage, next.pipeline) === g);
      };
      const who = `${r.studentName} — ${r.universityName}`;

      const cells: Record<string, React.ReactNode> = {
        student: (
          <LongTextCell text={r.studentName} label="Student" rowName={r.studentName} href={`/students/${r.studentId}/applications`} widthClassName="max-w-[12rem]" />
        ),
        student_code: r.studentCode ? <span className="font-mono text-xs">{r.studentCode}</span> : <span className="text-muted">—</span>,
        priority: (
          <PriorityCell
            number={r.number}
            canUp={neighbour(-1)}
            canDown={neighbour(1)}
            onMove={(d) => move(r, d)}
            disabled={locked}
            universityName={r.universityName}
          />
        ),
        country: <LongTextCell text={r.country} label="Country" rowName={who} widthClassName="max-w-[9rem]" />,
        university: (
          <LongTextCell
            text={r.universityName}
            label="University"
            rowName={r.studentName}
            href={`/students/${r.studentId}/applications/${r.id}`}
            widthClassName="max-w-[14rem]"
            className="font-medium"
          />
        ),
        city: <LongTextCell text={r.city} label="City" rowName={who} widthClassName="max-w-[7rem]" />,
        program: (
          <ChoiceCell
            value={r.programId ?? ""}
            options={programs.map((p) => ({ value: p.id, label: p.level ? `${p.name} (${p.level})` : p.name }))}
            emptyLabel="No programme"
            display={r.programName ?? <span className="text-warning">Choose a programme</span>}
            label="Programme"
            disabled={locked || r.finalized}
            title={r.finalized ? "Finalised for the visa, so the programme is fixed — undo that to change it." : undefined}
            widthClassName="max-w-[16rem]"
            onSave={(id) => {
              const next = programs.find((p) => p.id === id) ?? null;
              const keepsRound = Boolean(next?.rounds.some((x) => x.id === r.roundId));
              return save(r, "program", id, {
                programId: next?.id ?? null,
                programName: next?.name ?? null,
                level: next?.level ?? null,
                ...(keepsRound ? {} : { roundId: null, roundLabel: null }),
              });
            }}
          />
        ),
        level: <LongTextCell text={r.level} label="Level" rowName={who} widthClassName="max-w-[7rem]" />,
        intake: <TextCell value={r.intake} label="Intake" disabled={locked} widthClassName="max-w-[8rem]" onSave={(v) => save(r, "intake", v, { intake: v.trim() || null }, { reread: false })} />,
        round:
          rounds.length === 0 && !r.roundId ? (
            <span className="text-muted" title={r.programId ? "This programme runs no intake rounds." : "Choose the programme first."}>
              —
            </span>
          ) : (
            <ChoiceCell
              value={r.roundId ?? ""}
              options={rounds.map((x) => ({
                value: x.id,
                label: x.deadlineText || x.deadline ? `${x.label} · closes ${x.deadlineText ?? formatDateOnly(x.deadline!, ROUND_DATE_FORMAT)}` : x.label,
              }))}
              emptyLabel="No round"
              // Asked for while the application is being worked; past that, only noted.
              display={r.roundLabel ?? (g === "progress" ? <span className="text-warning">Choose a round</span> : <span className="text-muted">No round</span>)}
              label="Round"
              disabled={locked}
              widthClassName="max-w-[12rem]"
              onSave={(id) => {
                const x = rounds.find((y) => y.id === id) ?? null;
                return save(r, "round", id, {
                  roundId: x?.id ?? null,
                  roundLabel: x?.label ?? null,
                  ...(r.deadlineSource !== "application" && x?.deadline ? { deadline: x.deadline, deadlineSource: "round" as const } : {}),
                });
              }}
            />
          ),
        deadline: (
          <TextCell
            value={r.ownDeadline}
            type="date"
            label="Deadline"
            disabled={locked}
            widthClassName="max-w-[13rem]"
            display={r.deadline ? <DeadlineText date={r.deadline} source={r.deadlineSource} today={today} live={g === "progress"} /> : null}
            onSave={(v) =>
              save(r, "deadline", v, v ? { ownDeadline: v, deadline: v, deadlineSource: "application" } : { ownDeadline: null, ...(r.deadlineSource === "application" ? { deadline: null, deadlineSource: null } : {}) })
            }
          />
        ),
        stage: <StageCell stage={r.stage} pipeline={r.pipeline} disabled={locked} onSave={(s) => saveStage(r, s)} />,
        fee: (
          <TextCell
            value={r.fee}
            label="Application fee"
            disabled={locked}
            widthClassName="max-w-[9rem]"
            display={r.fee ? formatFee(r.fee, r.feeCurrency) : null}
            onSave={(v) => save(r, "fee", v, { fee: v.trim() || null })}
          />
        ),
        requirements: (
          <TextCell
            value={r.requirements}
            label="Special requirements"
            multiline
            disabled={locked}
            widthClassName="max-w-[14rem]"
            onSave={(v) => save(r, "requirements", v, { requirements: v.trim() || null }, { reread: false })}
          />
        ),
        finalized: (
          <FinalizeCell
            finalized={r.finalized}
            blocked={finalizedIn.has(intakeOf(r)) && finalizedIn.get(intakeOf(r)) !== r.id}
            ended={g === "rejected" || g === "closed"}
            actionLabel={r.finalizeLabel || "Finalize for visa"}
            badgeLabel={r.finalizedBadge || "Finalized for visa"}
            universityName={r.universityName}
            disabled={locked}
            onSave={(f) => save(r, "finalized", f, { finalized: f }, { saved: f ? `${r.finalizedBadge || "Finalized for visa"}.` : "Undone." })}
          />
        ),
        remark: (
          <RemarkCell
            leadId={r.id}
            leadName={who}
            remark={r.remark}
            updatedAt={r.remarkAt}
            updatedBy={r.remarkBy}
            store={APPLICATION_REMARKS}
            onSaved={(remark, at, by) => patchRow(r.id, { remark, remarkAt: at, remarkBy: by }, nextStamp())}
          />
        ),
        tasks: (
          <Link prefetch={false} href={`/students/${r.studentId}/applications/${r.id}`} className="hover:underline" title="Open the application's tasks">
            {r.tasksTotal === 0 ? (
              <span className="text-muted">—</span>
            ) : r.tasksOpen > 0 ? (
              <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">{r.tasksOpen} open</span>
            ) : (
              <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">All done</span>
            )}
          </Link>
        ),
        counselor: <LongTextCell text={r.counselorName} label="Counsellor" rowName={who} widthClassName="max-w-[9rem]" />,
        officer: <LongTextCell text={r.officerName} label="Processing" rowName={who} widthClassName="max-w-[9rem]" />,
        portal_link: catalogueLink(r, "portal_link", "Application portal", r.portalLink),
        page_link: catalogueLink(r, "page_link", "Programme page", r.pageLink),
        requirements_link: catalogueLink(r, "requirements_link", "Requirements page", r.requirementsLink),
        coordinator_email: catalogueEmail(r, "coordinator_email", "Coordinator email", r.coordinatorEmail),
        university_email: catalogueEmail(r, "university_email", "University email", r.universityEmail),
        updated: <span className="whitespace-nowrap text-xs text-muted">{formatDateOnly(r.updatedAt.slice(0, 10), ROUND_DATE_FORMAT)}</span>,
        actions: (
          <span className="inline-flex items-center gap-2">
            <Link
              prefetch={false}
              href={`/students/${r.studentId}/applications/${r.id}`}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
              title="Open the application: documents, tasks, interviews and the visa"
            >
              Open
              <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
            {canDelete && !locked && (
              <button type="button" onClick={() => remove(r)} className="text-muted hover:text-danger" aria-label={`Delete the application to ${r.universityName}`} title="Delete">
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ),
      };

      const csv: Record<string, string> = Object.fromEntries(columns.map((c) => [c.key, applicationCellText(r, c.key)]));
      csv.f_country = r.country ?? "";
      csv.f_stage = stageLabel(r.stage);
      csv.f_counselor = r.counselorName ?? "";
      csv.f_officer = r.officerName ?? "";
      csv.f_finalized = r.finalized ? "Finalised" : "Not finalised";
      return { id: r.id, cells, csv, tone: g };
    });

    function catalogueLink(r: ApplicationRow, cell: ApplicationCell, name: string, value: string | null) {
      return (
        <TextCell
          value={value}
          label={name}
          disabled={readOnly || !canEditCatalogue || !r.programId}
          widthClassName="max-w-[11rem]"
          display={value ? <SafeLink value={value} /> : null}
          onSave={(v) =>
            save(r, cell, v, {
              [cell === "portal_link" ? "portalLink" : cell === "page_link" ? "pageLink" : "requirementsLink"]: v.trim() || null,
            })
          }
        />
      );
    }
    function catalogueEmail(r: ApplicationRow, cell: ApplicationCell, name: string, value: string | null) {
      return (
        <TextCell
          value={value}
          label={name}
          disabled={readOnly || !canEditCatalogue || (cell === "coordinator_email" && !r.programId)}
          widthClassName="max-w-[13rem]"
          display={value ? <EmailLinks value={value} /> : null}
          onSave={(v) => save(r, cell, v, { [cell === "coordinator_email" ? "coordinatorEmail" : "universityEmail"]: v.trim() || null })}
        />
      );
    }
    // save, move and remove change with every render; what they read is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, group, programsByUniversity, columns, readOnly, canEditCatalogue, canDelete, today]);

  const options = (pick: (r: ApplicationRow) => string | null) =>
    [...new Set(merged.map(pick).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
  const filters = [
    { key: "f_country", label: "Country", options: options((r) => r.country) },
    { key: "f_stage", label: "Stage", options: options((r) => stageLabel(r.stage)) },
    ...(scope === "all"
      ? [
          { key: "f_counselor", label: "Counsellor", options: options((r) => r.counselorName) },
          { key: "f_officer", label: "Processing", options: options((r) => r.officerName) },
        ]
      : []),
    { key: "f_finalized", label: "Finalised", options: ["Finalised", "Not finalised"] },
  ].filter((f) => f.options.length > 1);

  const total = merged.length;
  return (
    <div className="flex flex-col gap-3" data-applications-table={scope}>
      {total > 0 && (
        <div className="flex flex-col gap-2" data-group-summary>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setGroup("")}
              aria-pressed={group === ""}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${group === "" ? "border-primary bg-primary text-primary-ink" : "border-border bg-card text-ink hover:border-primary"}`}
            >
              All <span className="ml-1 tabular-nums opacity-80">{total}</span>
            </button>
            {GROUPS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setGroup((g) => (g === key ? "" : key))}
                aria-pressed={group === key}
                disabled={counts[key] === 0}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${group === key ? "border-ink bg-ink text-card" : "border-border bg-card text-ink hover:border-primary"}`}
                data-group-chip={key}
              >
                <span aria-hidden className={`h-2 w-2 rounded-full ${GROUP_DOT[key]}`} />
                {GROUP_LABEL[key]}
                <span className="tabular-nums opacity-80">{counts[key]}</span>
              </button>
            ))}
          </div>
          {/* The whole list at a glance: how much of it has an offer, how much was turned down. */}
          <div className="flex h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
            {GROUPS.map((key) =>
              counts[key] ? <span key={key} className={`${GROUP_DOT[key]} h-full transition-all`} style={{ width: `${(counts[key] / total) * 100}%` }} /> : null
            )}
          </div>
        </div>
      )}
      <DataTable
        columns={[
          ...columns.map((c) => ({
            key: c.key,
            header: c.header,
            wrap: c.key === "requirements" || c.key === "stage",
          })),
          { key: "actions", header: "", exportable: false },
        ]}
        rows={tableRows}
        searchable
        searchPlaceholder="Search student, university, programme…"
        filters={filters}
        exportHref={exportHref}
        label={label}
        freezeColumn={scope === "all" ? "student" : "university"}
        // A student's tab: the application's number stays beside its university.
        freezeSerial={scope === "student"}
        minTableWidthClassName="min-w-[1200px]"
        oneLine
        dense
        rowHighlight
        expandable
        virtualRowHeight={38}
        gridLines
        expandedHeading={
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 className="text-base font-semibold text-ink">{heading.title}</h2>
            {heading.detail && <span className="text-xs text-muted">{heading.detail}</span>}
          </div>
        }
      />
    </div>
  );
}

/** The date that applies, how long is left while it still matters, and where it comes from when not typed here. */
function DeadlineText({
  date,
  source,
  today,
  live,
}: {
  date: string | null;
  source: ApplicationRow["deadlineSource"];
  today: string;
  /** Still being worked: a deadline matters, and the last month's days are counted. */
  live: boolean;
}) {
  if (!date) return null;
  const days = daysUntil(date, today);
  const tone = !live ? "text-muted" : days < 0 ? "text-danger" : days <= 7 ? "text-warning" : "text-ink";
  const chip = days < 0 ? `${-days}d late` : days === 0 ? "today" : `${days}d left`;
  const chipTone = days < 0 ? "bg-danger-bg text-danger" : days <= 7 ? "bg-warning-bg text-warning" : "bg-info-bg text-info";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" data-deadline={date}>
      <span className={tone}>{formatDateOnly(date, ROUND_DATE_FORMAT)}</span>
      {live && days <= 30 && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${chipTone}`}>{chip}</span>}
      {source && source !== "application" && (
        <span className="text-[10px] text-muted" title={`The ${source}'s deadline — type a date to give this application its own.`}>
          {source}
        </span>
      )}
    </span>
  );
}
