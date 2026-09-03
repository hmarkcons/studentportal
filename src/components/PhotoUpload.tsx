"use client";

import { useActionState } from "react";
import { uploadStudentPhoto } from "@/lib/actions/studentProfileExtras";
import { Button } from "@/components/ui/Button";

export function PhotoUpload({ studentId, revalidateTo, photoUrl }: { studentId: string; revalidateTo: string; photoUrl: string | null }) {
  const action = uploadStudentPhoto.bind(null, studentId, revalidateTo);
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
