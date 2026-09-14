"use client";

import { useActionState, useState } from "react";
import { partnerUploadDocument } from "@/lib/actions/partner";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";
import { Input } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";

export function UploadExchangeForm({ universityId }: { universityId: string }) {
  const action = partnerUploadDocument.bind(null, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [ready, setReady] = useState(false);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {/* max-w-full: a native file input has an intrinsic minimum width that
          overflows the page at 320px otherwise. */}
      <FileField required hint="PDF, Word or image" inputClassName="text-sm" onChange={(s) => setReady(Boolean(s.file))} />
      <Input name="description" placeholder="Description" />
      <Button type="submit" pending={pending} variant="primary" disabled={!ready}>
        Upload
      </Button>
      <ActionStatus state={state} pending={pending} label="Uploaded." />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
