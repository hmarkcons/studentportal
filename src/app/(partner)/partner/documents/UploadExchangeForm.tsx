"use client";

import { useActionState } from "react";
import { partnerUploadDocument } from "@/lib/actions/partner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function UploadExchangeForm({ universityId }: { universityId: string }) {
  const action = partnerUploadDocument.bind(null, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {/* max-w-full: a native file input has an intrinsic minimum width that
          overflows the page at 320px otherwise. */}
      <input type="file" name="file" required className="max-w-full text-sm" />
      <Input name="description" placeholder="Description" />
      <Button type="submit" pending={pending} variant="primary">
        Upload
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
