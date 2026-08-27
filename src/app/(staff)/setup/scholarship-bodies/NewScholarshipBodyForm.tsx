"use client";

import { useActionState } from "react";
import { createScholarshipBody } from "@/lib/actions/scholarships";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function NewScholarshipBodyForm() {
  const [state, formAction, pending] = useActionState(createScholarshipBody, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Input name="name" placeholder="Scholarship body name" required className="min-w-[180px] flex-1" />
      <Input name="region" placeholder="Region" />
      <Input name="academic_year" placeholder="AY 2026/2027" required className="w-32" />
      <Input name="covers" placeholder="Universities it covers (comma-separated)" className="min-w-[200px]" />
      <Input name="stipend_amount" placeholder="Stipend / notes" />
      <Button type="submit" variant="primary" pending={pending}>
        Add
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
