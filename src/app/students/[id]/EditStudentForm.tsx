"use client";

import { useActionState } from "react";
import { updateStudent } from "@/lib/actions/students";
import { DESTINATION_COUNTRIES, STAGES, STAGE_LABELS } from "@/lib/stages";

type StaffOption = { id: string; full_name: string; role: string };

export function EditStudentForm({
  studentId,
  student,
  counselors,
  canReassign,
}: {
  studentId: string;
  student: {
    full_name: string;
    email: string | null;
    phone: string | null;
    destination_country: string;
    current_stage: string;
    assigned_counselor_id: string | null;
  };
  counselors: StaffOption[];
  canReassign: boolean;
}) {
  const boundAction = updateStudent.bind(null, studentId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="full_name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          required
          defaultValue={student.full_name}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={student.email ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            defaultValue={student.phone ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="destination_country" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Destination
          </label>
          <select
            id="destination_country"
            name="destination_country"
            required
            defaultValue={student.destination_country}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {DESTINATION_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="current_stage" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Stage
          </label>
          <select
            id="current_stage"
            name="current_stage"
            required
            defaultValue={student.current_stage}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Assigned counselor</label>
        {canReassign ? (
          <select
            name="assigned_counselor_id"
            defaultValue={student.assigned_counselor_id ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Unassigned</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} {c.role === "admin" ? "(admin)" : ""}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input type="hidden" name="assigned_counselor_id" value={student.assigned_counselor_id ?? ""} />
            <p className="rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Only admin can reassign
            </p>
          </>
        )}
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
