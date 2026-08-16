"use client";

import { useActionState } from "react";
import { createStudent } from "@/lib/actions/students";
import { DESTINATION_COUNTRIES } from "@/lib/stages";

type StaffOption = { id: string; full_name: string; role: string };

export function NewStudentForm({
  counselors,
  lockedToSelf,
}: {
  counselors: StaffOption[];
  lockedToSelf: StaffOption | null;
}) {
  const [state, formAction, pending] = useActionState(createStudent, undefined);

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
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="destination_country" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Destination
        </label>
        <select
          id="destination_country"
          name="destination_country"
          required
          defaultValue=""
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="" disabled>
            Select a country
          </option>
          {DESTINATION_COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Assigned counselor</label>
        {lockedToSelf ? (
          <>
            <input type="hidden" name="assigned_counselor_id" value={lockedToSelf.id} />
            <p className="rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {lockedToSelf.full_name} (you)
            </p>
          </>
        ) : (
          <select
            name="assigned_counselor_id"
            defaultValue=""
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Unassigned</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} {c.role === "admin" ? "(admin)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Creating…" : "Create case"}
      </button>
    </form>
  );
}
