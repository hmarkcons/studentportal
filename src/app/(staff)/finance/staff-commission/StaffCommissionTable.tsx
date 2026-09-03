"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ProofFileCell } from "@/components/ProofFileCell";
import { toPKR } from "@/lib/constants";
import {
  createStaffCommission,
  updateStaffCommission,
  deleteStaffCommission,
  markStaffCommissionPaid,
  uploadStaffCommissionProof,
  carryForwardCommissionCredit,
} from "@/lib/actions/finance";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/invoiceStatus";

const REVALIDATE_TO = "/finance/staff-commission";
const PAGE_SIZE = 10;

export type CommissionRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  registration_date: string | null;
  payment_proof_path: string | null;
  staffId: string;
  staffName: string;
  studentName: string;
  studentEmail: string | null;
  registeredMonth: string | null;
  registrationStatus: string | null;
  universityName: string | null;
  programName: string | null;
  intake: string | null;
  refundCount: number;
  consultancyFeeStatus: InvoiceStatus | null;
  adminFeeStatus: "paid" | "unpaid" | null;
  hasCredit: boolean;
};

export type AvailableCredit = { id: string; staff_id: string; amount: number; currency: string };
export type StudentCommissionBasis = { track: string | null; consultancyFee: number | null; currency: string | null };

function AddCommissionForm({
  staffList,
  students,
  availableCredits,
  studentCommissionBasis,
}: {
  staffList: { id: string; full_name: string; commission_rate_general: number | null; commission_rate_public_universities: number | null }[];
  students: { id: string; full_name: string; assigned_counselor_id: string | null }[];
  availableCredits: AvailableCredit[];
  studentCommissionBasis: Record<string, StudentCommissionBasis>;
}) {
  const action = createStaffCommission.bind(null, REVALIDATE_TO);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [staffId, setStaffId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [applyCredit, setApplyCredit] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [amountEdited, setAmountEdited] = useState(false);
  const [suggestionKey, setSuggestionKey] = useState<string | null>(null);

  // Only students assigned to the selected staff member show up — matches
  // the same staff member who'll actually be credited/paid for them.
  const eligibleStudents = useMemo(
    () => students.filter((s) => s.assigned_counselor_id === staffId),
    [students, staffId]
  );

  const credit = useMemo(() => availableCredits.find((c) => c.staff_id === staffId) ?? null, [availableCredits, staffId]);

  const staff = staffList.find((s) => s.id === staffId) ?? null;
  const basis = studentCommissionBasis[studentId] ?? null;
  // Public/private destination track picks which of the staff member's two
  // commission rates applies — matches how the staff record's own two rate
  // fields are named and shown on the payroll page.
  const rate = staff && basis ? (basis.track === "public" ? staff.commission_rate_public_universities : staff.commission_rate_general) : null;
  const suggestedAmount =
    rate != null && basis?.consultancyFee != null ? Math.round(basis.consultancyFee * (rate / 100) * 100) / 100 : null;

  // Auto-fill on each new staff/student pick — adjusting state during render
  // (React's documented pattern for this) rather than in an effect, so it
  // takes effect in the same render instead of flashing the old value first.
  // Never re-applied afterward without a new pick, so a real correction the
  // user typed is never silently overwritten.
  const currentSuggestionKey = `${staffId}|${studentId}`;
  if (currentSuggestionKey !== suggestionKey) {
    setSuggestionKey(currentSuggestionKey);
    setAmountEdited(false);
    setAmount(suggestedAmount != null ? String(suggestedAmount) : "");
    setCurrency(basis?.currency ?? "PKR");
  }

  const amountNum = Number(amount) || 0;
  const amountAfterCredit = credit && applyCredit ? Math.max(0, amountNum - credit.amount) : amountNum;

  return (
    <form action={formAction} className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Select
          name="staff_id"
          required
          value={staffId}
          onChange={(e) => {
            setStaffId(e.target.value);
            setStudentId("");
            setApplyCredit(false);
          }}
        >
          <option value="">Staff…</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </Select>
        <Select
          name="student_id"
          required
          disabled={!staffId}
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        >
          <option value="">{staffId ? (eligibleStudents.length ? "Student…" : "No students assigned to this staff member") : "Choose staff first"}</option>
          {eligibleStudents.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </Select>
        <Input
          name="amount"
          type="number"
          step="0.01"
          placeholder="Commission amount"
          required
          className="w-32"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setAmountEdited(true);
          }}
        />
        <Select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="PKR">PKR</option>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
        </Select>
        <Input name="registration_date" type="date" />
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Adding…" : "+ Add commission"}
        </Button>
      </div>
      {suggestedAmount != null && !amountEdited && (
        <p className="text-xs text-muted">
          Suggested: {rate}% of {basis?.currency} {basis?.consultancyFee?.toFixed(2)} ({basis?.track} track consultancy fee, discount already
          applied) — adjust if needed.
        </p>
      )}
      {staffId && studentId && suggestedAmount == null && (
        <p className="text-xs text-muted">
          No suggestion available — this student has no signed agreement on file, or {staff?.full_name ?? "this staff member"} has no commission
          rate set for a {basis?.track ?? "this"} track destination.
        </p>
      )}
      {credit && (
        <div className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-ink">
          <input
            type="checkbox"
            id="apply-credit"
            checked={applyCredit}
            onChange={(e) => setApplyCredit(e.target.checked)}
          />
          <input type="hidden" name="apply_credit_id" value={applyCredit ? credit.id : ""} />
          <label htmlFor="apply-credit">
            Credit available: <strong>{credit.currency} {credit.amount}</strong> (carried forward from a no-admission/withdrawn student) — apply it to this commission.
            {applyCredit && <span className="ml-1 text-muted">New amount after credit: {credit.currency} {amountAfterCredit}</span>}
          </label>
        </div>
      )}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function EditRow({ row, onDone }: { row: CommissionRow; onDone: () => void }) {
  const action = updateStaffCommission.bind(null, row.id, REVALIDATE_TO);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1 rounded-md border border-border p-2">
      <Input name="amount" type="number" step="0.01" defaultValue={row.amount} required className="w-24" />
      <Input name="currency" defaultValue={row.currency} required className="w-16" />
      <Input name="registration_date" type="date" defaultValue={row.registration_date ?? ""} />
      <Select name="status" defaultValue={row.status}>
        <option value="unpaid">unpaid</option>
        <option value="paid">paid</option>
      </Select>
      <Select name="payment_method" defaultValue={row.payment_method ?? ""}>
        <option value="">Method…</option>
        <option value="Cash">Cash</option>
        <option value="Bank transfer">Bank transfer</option>
        <option value="Card">Card</option>
        <option value="Other">Other</option>
      </Select>
      <Button type="submit" variant="primary" size="sm" pending={pending}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Cancel
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function MarkPaidButton({ id }: { id: string }) {
  const action = markStaffCommissionPaid.bind(null, id, REVALIDATE_TO);
  const [, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <Button type="submit" variant="success" size="sm">
        Mark paid
      </Button>
    </form>
  );
}

function CarryForwardButton({ id, studentName }: { id: string; studentName: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    if (!confirm(`Mark this paid commission for ${studentName} as a credit? It'll be available to offset a new commission for the same staff member.`)) return;
    setPending(true);
    setError(null);
    const result = await carryForwardCommissionCredit(id, REVALIDATE_TO);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        pending={pending}
        onClick={handle}
        title="Student had no admission, or withdrew/went ghost — carry this paid amount forward as a credit"
      >
        No admission — carry forward
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function DeleteCommissionButton({ id, studentName }: { id: string; studentName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete this commission record for ${studentName}?`)) return;
    setPending(true);
    setError(null);
    const result = await deleteStaffCommission(id, REVALIDATE_TO);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={handleDelete} pending={pending}>
        🗑️
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function feeStatusTone(status: string | null) {
  if (status === "paid" || status === "registered") return "success" as const;
  if (status === "overdue" || status === "withdrawn") return "danger" as const;
  if (status === "pending" || status === "unpaid") return "warning" as const;
  return "neutral" as const;
}

function StatCard({
  icon,
  iconTone,
  label,
  value,
  caption,
}: {
  icon: string;
  iconTone: "primary" | "success" | "danger" | "warning";
  label: string;
  value: string;
  caption: string;
}) {
  const iconBg = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
    warning: "bg-warning/10 text-warning",
  }[iconTone];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-md text-base ${iconBg}`}>{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{caption}</p>
    </div>
  );
}

export function StaffCommissionTable({
  rows,
  staffList,
  students,
  proofUrls,
  availableCredits,
  studentCommissionBasis,
}: {
  rows: CommissionRow[];
  staffList: { id: string; full_name: string; commission_rate_general: number | null; commission_rate_public_universities: number | null }[];
  students: { id: string; full_name: string; assigned_counselor_id: string | null }[];
  proofUrls: Record<string, string>;
  availableCredits: AvailableCredit[];
  studentCommissionBasis: Record<string, StudentCommissionBasis>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [monthInput, setMonthInput] = useState("all");
  const [counselorInput, setCounselorInput] = useState("all");
  const [regStatusInput, setRegStatusInput] = useState("all");
  const [commStatusInput, setCommStatusInput] = useState("all");
  const [applied, setApplied] = useState({ name: "", month: "all", counselor: "all", regStatus: "all", commStatus: "all" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  function search() {
    setApplied({ name: nameInput.trim().toLowerCase(), month: monthInput, counselor: counselorInput, regStatus: regStatusInput, commStatus: commStatusInput });
    setPage(1);
  }
  function clear() {
    setNameInput("");
    setMonthInput("all");
    setCounselorInput("all");
    setRegStatusInput("all");
    setCommStatusInput("all");
    setApplied({ name: "", month: "all", counselor: "all", regStatus: "all", commStatus: "all" });
    setPage(1);
  }

  const months = useMemo(
    () => Array.from(new Set(rows.map((r) => r.registeredMonth).filter((m): m is string => Boolean(m)))),
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (applied.name && !r.studentName.toLowerCase().includes(applied.name) && !r.staffName.toLowerCase().includes(applied.name)) return false;
        if (applied.month !== "all" && r.registeredMonth !== applied.month) return false;
        if (applied.counselor !== "all" && r.staffId !== applied.counselor) return false;
        if (applied.regStatus !== "all" && r.registrationStatus !== applied.regStatus) return false;
        if (applied.commStatus !== "all" && r.status !== applied.commStatus) return false;
        return true;
      }),
    [rows, applied]
  );

  const stats = useMemo(() => {
    const totalPKR = filtered.reduce((sum, r) => sum + toPKR(r.amount, r.currency), 0);
    const paid = filtered.filter((r) => r.status === "paid").length;
    const unpaid = filtered.filter((r) => r.status === "unpaid").length;
    const refunds = filtered.reduce((sum, r) => sum + r.refundCount, 0);
    return { totalPKR, paid, unpaid, refunds };
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="💰" iconTone="primary" label="Total Commission" value={`₨ ${Math.round(stats.totalPKR).toLocaleString()}`} caption="Filtered records" />
        <StatCard icon="✅" iconTone="success" label="Paid" value={String(stats.paid)} caption="Commission paid" />
        <StatCard icon="⏳" iconTone="warning" label="Unpaid" value={String(stats.unpaid)} caption="Awaiting payment" />
        <StatCard icon="🔄" iconTone="danger" label="Refunds" value={String(stats.refunds)} caption="Refund requests on file" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Student</h3>
        <Button variant="primary" size="sm" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? "Close" : "+ Add Student"}
        </Button>
      </div>

      {showAddForm && (
        <AddCommissionForm
          staffList={staffList}
          students={students}
          availableCredits={availableCredits}
          studentCommissionBasis={studentCommissionBasis}
        />
      )}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Search
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Student or staff name…"
            className="w-48 px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Month
          <Select value={monthInput} onChange={(e) => setMonthInput(e.target.value)} className="w-36">
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Counselor
          <Select value={counselorInput} onChange={(e) => setCounselorInput(e.target.value)} className="w-40">
            <option value="all">All counselors</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Reg. Status
          <Select value={regStatusInput} onChange={(e) => setRegStatusInput(e.target.value)} className="w-36">
            <option value="all">All</option>
            <option value="registered">Registered</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="ghost">Ghost</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Comm. Status
          <Select value={commStatusInput} onChange={(e) => setCommStatusInput(e.target.value)} className="w-32">
            <option value="all">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </Select>
        </label>
        <Button variant="primary" onClick={search}>
          Search
        </Button>
        <Button onClick={clear}>Clear</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[1700px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="whitespace-nowrap px-4 py-3">Student</th>
              <th className="whitespace-nowrap px-4 py-3">Reg. Month</th>
              <th className="whitespace-nowrap px-4 py-3">University</th>
              <th className="whitespace-nowrap px-4 py-3">Program</th>
              <th className="whitespace-nowrap px-4 py-3">Intake</th>
              <th className="whitespace-nowrap px-4 py-3">Counselor</th>
              <th className="whitespace-nowrap px-4 py-3">Reg. Status</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Commission</th>
              <th className="whitespace-nowrap px-4 py-3">Comm. Status</th>
              <th className="whitespace-nowrap px-4 py-3">Proof</th>
              <th className="whitespace-nowrap px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 align-top">
                {editingId === r.id ? (
                  <td colSpan={11} className="px-4 py-3">
                    <EditRow row={r} onDone={() => setEditingId(null)} />
                  </td>
                ) : (
                  <>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="text-ink">{r.studentName}</span>
                      {r.studentEmail && <span className="ml-2 text-xs text-muted">{r.studentEmail}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{r.registeredMonth ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink">{r.universityName ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink">{r.programName ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{r.intake ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink">{r.staffName}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {r.registrationStatus ? (
                        <Badge tone={feeStatusTone(r.registrationStatus)}>{r.registrationStatus}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink">
                      {r.currency} {r.amount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge tone={r.status === "paid" ? "success" : "warning"}>{r.status}</Badge>
                      {r.payment_method && <span className="ml-2 text-xs text-muted">{r.payment_method}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <ProofFileCell viewUrl={proofUrls[r.id]} uploadAction={uploadStaffCommissionProof.bind(null, r.id, REVALIDATE_TO)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        {r.status !== "paid" && <MarkPaidButton id={r.id} />}
                        {r.status === "paid" && !r.hasCredit && <CarryForwardButton id={r.id} studentName={r.studentName} />}
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(r.id)}>
                          ✏️ Edit
                        </Button>
                        <DeleteCommissionButton id={r.id} studentName={r.studentName} />
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-muted">
                  No commission records match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>
            {rangeStart}-{rangeEnd} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </Button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage((p) => p + 1)}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
