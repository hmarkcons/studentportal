"use client";

import { useActionState, useRef } from "react";
import { uploadMediaAsset } from "@/lib/actions/socialMedia";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function MediaUploadForm() {
  const [state, action, pending] = useActionState(uploadMediaAsset, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => {
        // Clear the picker after a submit so the same file can be re-picked.
        setTimeout(() => formRef.current?.reset(), 0);
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-2 p-3"
    >
      <label className="flex flex-col gap-1 text-xs text-muted">
        Image or video
        <Input name="file" type="file" accept="image/*,video/*" required className="text-sm" />
      </label>
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted">
        Alt text (optional)
        <Input name="alt_text" placeholder="Describe the image for accessibility" />
      </label>
      <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Uploaded." }}>
        Upload
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
