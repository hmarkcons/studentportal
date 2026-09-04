"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";

type PhotoUploadState = { error?: string; success?: boolean } | undefined;

export function PhotoUpload({
  action,
  photoUrl,
}: {
  // A bound server action (studentId/staffId + revalidateTo already applied)
  // — shared by the student Profile pages and the staff Admin form so both
  // get the same upload UI without duplicating it.
  action: (prevState: PhotoUploadState, formData: FormData) => Promise<PhotoUploadState>;
  photoUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="flex items-center gap-4">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="Profile photo" className="h-20 w-20 rounded-full border border-border object-cover" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-border text-xs text-muted">
          No photo
        </div>
      )}
      <form action={formAction} className="flex items-center gap-2">
        <input type="file" name="file" accept="image/*" className="text-xs" />
        <Button type="submit" variant="outline" size="sm" pending={pending}>
          {photoUrl ? "Replace photo" : "Upload photo"}
        </Button>
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      </form>
    </div>
  );
}
