"use client";

import { useActionState } from "react";
import { createTicket } from "@/lib/actions/support";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function NewTicketForm({ studentId }: { studentId: string }) {
  const action = createTicket.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Input name="subject" placeholder="Subject" required />
      <Textarea name="body" placeholder="How can we help?" required rows={3} />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" pending={pending} className="self-start">
        Submit ticket
      </Button>
    </form>
  );
}
