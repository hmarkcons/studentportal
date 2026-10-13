"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, CircleDollarSign, Download, FileSpreadsheet, Hourglass, Pencil, Plus, Search, Trash2, Undo2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { TableFrame } from "@/components/ui/TableFrame";
import { Badge } from "@/components/ui/Badge";
import { PreviewedImport } from "@/components/PreviewedImport";
import { toast } from "@/lib/toast";
import { deleteAeoRecords, importAeoCommissions, markAeoPaid, markAeoUnpaid } from "@/lib/actions/aeoCommissions";
import { aeoTotals, challanYears, dmy, formatPkr, matchesFilter, type AeoRecord, type PaymentStatus } from "@/lib/aeoCommissions";
import { AeoRecordForm } from "./AeoRecordForm";

/**
 * The register: what is owed and paid at a glance, the rows with a search and
 * a filter by status and year, each row edited or deleted where it is, several
 * at once marked paid on one date with one reference — a single AEO transfer
 * usually covers a batch — and the import and the export, both in the
 * office's own sheet.
 */
export function AeoRegister({ records, today }: { records: AeoRecord[]; today: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [year, setYear] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AeoRecord | "new" | null>(null);
  const [paying, setPaying] = useState(false);
  const [importOpen, setImportOpen] = useState(records.length === 0);
  const [busy, setBusy] = useState<string | null>(null);

  const filter = { q, status, year };
  const shown = useMemo(() => records.filter((r) => matchesFilter(r, { q, status, year })), [records, q, status, year]);
  const totals = aeoTotals(shown);
  const years = useMemo(() => challanYears(records), [records]);
  const filtered = shown.length !== records.length;

  // Only what is still on screen counts as selected: a row filtered away, or deleted, is not acted on.
  const picked = shown.filter((r) => selected.has(r.id));
  const pickedTotal = aeoTotals(picked);
  const allPicked = shown.length > 0 && picked.length === shown.length;

  const exportHref = `/api/export/aeo-pakistan?${new URLSearchParams(
    Object.entries(filter)
      .filter(([, v]) => v && v !== "all")
      .map(([k, v]) => [k, String(v)]),
  )}`;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(what: string, act: () => Promise<{ error: string } | { success: true; message?: string }>) {
    setBusy(what);
    const result = await act();
    setBusy(null);
    if ("error" in result) {
      toast(result.error, "danger");
      return false;
    }
    if (result.message) toast(result.message);
    setSelected(new Set());
    return true;
  }

  async function remove(ids: string[], words: string) {
    if (!confirm(`Delete ${words}? A Super Admin can restore it from the audit log.`)) return;
    await run("delete", () => deleteAeoRecords(ids));
  }

  return (
    <div className="flex flex-col gap-5" data-aeo-register>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" data-aeo-totals>
        <StatCard
          label={filtered ? "Registrations shown" : "Registrations"}
          value={totals.count}
          icon={Users}
          hint={filtered ? `of ${records.length}` : undefined}
        />
        <StatCard label="Commission earned" value={formatPkr(totals.earned)} icon={CircleDollarSign} />
        <StatCard label="Paid by AEO" value={formatPkr(totals.paid)} icon={BadgeCheck} tone="success" hint={`${totals.paidCount} paid`} />
        <StatCard
          label="Outstanding"
          value={formatPkr(totals.outstanding)}
          icon={Hourglass}
          tone={totals.outstanding > 0 ? "warning" : "default"}
          hint={`${totals.unpaidCount} unpaid`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2" data-aeo-toolbar>
        <label className="relative w-full min-w-0 sm:w-72">
          <span className="sr-only">Search</span>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, challan, test, reference…" className="pl-8" autoComplete="off" />
        </label>
        <div className="w-36">
          <Select value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | "all")} aria-label="Payment status">
            <option value="all">All statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </Select>
        </div>
        <div className="w-32">
          <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Challan year">
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline-primary" onClick={() => setImportOpen((v) => !v)} aria-expanded={importOpen} aria-controls="aeo-import">
            <Upload aria-hidden className="h-4 w-4" />
            Import
          </Button>
          <a
            href={exportHref}
            data-aeo-export
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-bg"
          >
            <Download aria-hidden className="h-4 w-4" />
            {filtered ? `Export these ${shown.length}` : "Export to Excel"}
          </a>
          <Button type="button" variant="primary" onClick={() => setEditing("new")}>
            <Plus aria-hidden className="h-4 w-4" />
            Add registration
          </Button>
        </div>
      </div>

      <section id="aeo-import" hidden={!importOpen} aria-label="Import from Excel" className="rounded-xl border border-border bg-card p-4" data-aeo-import>
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileSpreadsheet aria-hidden className="h-4 w-4 text-primary" />
          Import from Excel
        </p>
        <p className="mt-1 text-xs text-muted">
          Your own sheet as it is — Sr. #, Candidate&apos;s Name, Challan Number, challan date, Test date, Commission&apos;s Amount, Payment Status — or an
          export of this page. Each row is matched by its <strong className="text-ink">challan number</strong>: one already here is updated, a new one is added.{" "}
          <strong className="text-ink">An empty cell changes nothing</strong>, and the Total row is passed over. Dates are read day first, however they were
          typed. Nothing is saved until you apply.
        </p>
        <div className="mt-3">
          <PreviewedImport
            action={importAeoCommissions}
            extras={
              <a
                href="/api/export/aeo-pakistan?template=1"
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-bg"
              >
                Blank template
              </a>
            }
          />
        </div>
      </section>

      {picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2" data-aeo-bulk>
          <span className="text-sm font-medium text-ink">
            {picked.length} selected · {formatPkr(pickedTotal.earned)}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="success" onClick={() => setPaying(true)} disabled={busy !== null}>
              <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
              Mark paid…
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => run("unpaid", () => markAeoUnpaid(picked.map((r) => r.id)))}
              pending={busy === "unpaid"}
              disabled={busy !== null && busy !== "unpaid"}
            >
              <Undo2 aria-hidden className="h-3.5 w-3.5" />
              Mark unpaid
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() =>
                remove(
                  picked.map((r) => r.id),
                  `${picked.length} registration${picked.length === 1 ? "" : "s"}`,
                )
              }
              pending={busy === "delete"}
              disabled={busy !== null && busy !== "delete"}
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted" data-aeo-empty>
          Nothing on file yet. Import your sheet above, or add a registration.
        </p>
      ) : (
        <TableFrame label="AEO Pakistan IELTS registrations" freezeFirstColumn={false}>
          <table className="w-full min-w-[68rem] text-sm" data-aeo-table>
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-muted">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select every row shown"
                    checked={allPicked}
                    onChange={() => setSelected(allPicked ? new Set() : new Set(shown.map((r) => r.id)))}
                  />
                </th>
                <th className="px-3 py-2">Sr. #</th>
                <th className="px-3 py-2">Candidate&apos;s name</th>
                <th className="px-3 py-2">Challan no.</th>
                <th className="px-3 py-2">Challan date</th>
                <th className="px-3 py-2">Test date</th>
                <th className="px-3 py-2 text-right">Commission</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-border/70 align-top hover:bg-bg/60" data-aeo-row={r.challan_number}>
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`Select ${r.candidate_name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted">{r.sr_no ?? "—"}</td>
                  <td className="px-3 py-2 font-medium text-ink">
                    {r.candidate_name}
                    {r.notes && <p className="mt-0.5 max-w-[16rem] text-xs font-normal text-muted">{r.notes}</p>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.challan_number}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{dmy(r.challan_date) || "—"}</td>
                  <td className="max-w-[22rem] px-3 py-2 text-xs text-muted">{r.test_details || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-ink">{formatPkr(r.commission_amount)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={r.payment_status === "paid" ? "success" : "warning"}>{r.payment_status === "paid" ? "Paid" : "Unpaid"}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {r.payment_status === "paid" ? (
                      <>
                        <span className="whitespace-nowrap tabular-nums text-ink">{dmy(r.paid_on) || "date not given"}</span>
                        {r.payment_reference && <span className="block">{r.payment_reference}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      aria-label={`Edit ${r.candidate_name}`}
                      className="rounded p-1 text-muted hover:bg-bg hover:text-primary"
                    >
                      <Pencil aria-hidden className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove([r.id], `${r.candidate_name} (challan ${r.challan_number})`)}
                      aria-label={`Delete ${r.candidate_name}`}
                      className="rounded p-1 text-muted hover:bg-danger-bg hover:text-danger"
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted">
                    Nothing matches — clear the search or the filters.
                  </td>
                </tr>
              )}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-semibold text-ink" data-aeo-total>
                  <td colSpan={6} className="px-3 py-2 text-right">
                    Total{filtered ? " shown" : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatPkr(totals.earned)}</td>
                  <td colSpan={3} className="px-3 py-2 text-xs font-normal text-muted">
                    {formatPkr(totals.outstanding)} outstanding
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </TableFrame>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add a registration" : "Edit registration"}>
        {editing !== null && (
          <AeoRecordForm
            key={editing === "new" ? "new" : editing.id}
            record={editing === "new" ? null : editing}
            today={today}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>

      <Modal open={paying} onClose={() => setPaying(false)} title={`Mark ${picked.length} paid`}>
        {paying && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const done = await run("paid", () =>
                markAeoPaid(
                  picked.map((r) => r.id),
                  String(form.get("paid_on") ?? ""),
                  String(form.get("payment_reference") ?? ""),
                ),
              );
              if (done) setPaying(false);
            }}
            className="flex flex-col gap-3"
            data-aeo-pay
          >
            <p className="text-sm text-muted">
              {picked.length} registration{picked.length === 1 ? "" : "s"}, {formatPkr(pickedTotal.earned)} — paid on one date, with one reference.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Paid on
                <Input name="paid_on" type="date" required defaultValue={today} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Payment reference
                <Input name="payment_reference" maxLength={120} placeholder="Cheque or transfer no." autoComplete="off" />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setPaying(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="success" pending={busy === "paid"}>
                Mark paid
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
