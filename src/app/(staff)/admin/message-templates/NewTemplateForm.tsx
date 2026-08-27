"use client";

import { useActionState } from "react";
import { createMessageTemplate } from "@/lib/actions/messageTemplates";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function NewTemplateForm() {
  const [state, formAction, pending] = useActionState(createMessageTemplate, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Input name="purpose" placeholder="Purpose (e.g. Document reminder)" required className="min-w-[220px] flex-1" />
        <Select name="channel" required>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
        </Select>
      </div>
      <Input name="subject" placeholder="Subject (email only)" />
      <Textarea name="body" placeholder="Message body…" required rows={3} />
      <Button type="submit" variant="primary" pending={pending} className="self-start">
        Add template
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
