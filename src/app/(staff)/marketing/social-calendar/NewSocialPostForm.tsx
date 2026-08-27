"use client";

import { useActionState } from "react";
import { createSocialPost } from "@/lib/actions/marketing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function NewSocialPostForm() {
  const [state, formAction, pending] = useActionState(createSocialPost, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Input name="post_date" type="date" required />
      <Input name="theme" placeholder="Content theme" required className="min-w-[200px] flex-1" />
      <Input name="platforms" placeholder="Facebook, Instagram" />
      <Button type="submit" variant="primary" pending={pending}>
        Add slot
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
