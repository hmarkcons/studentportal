"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";

type PhotoUploadState = { error?: string; success?: boolean } | undefined;

export function PhotoUpload({
  action,
  photoUrl,
  hidePreview = false,
  hasPhoto,
}: {
  // A bound server action (studentId/staffId + revalidateTo already applied)
  // — shared by the student Profile pages and the staff Admin form so both
  // get the same upload UI without duplicating it.
  action: (prevState: PhotoUploadState, formData: FormData) => Promise<PhotoUploadState>;
  photoUrl: string | null;
  // Set where the photo is already on screen elsewhere (the staff student
  // header shows it on every tab), so the Profile tab only needs the
  // controls rather than a second copy of the same picture.
  hidePreview?: boolean;
  // Only needed alongside hidePreview, where there's no photoUrl to infer
  // from but the button should still read "Replace photo".
  hasPhoto?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const showsReplace = hasPhoto ?? Boolean(photoUrl);

  // Photo on top, its controls stacked underneath and matched to the same
  // column width, so the block reads as one unit wherever it's dropped in
  // (student header, portal profile, staff admin form) instead of a wide
  // row that reflows differently on every page.
  return (
    <div className="flex w-52 max-w-full flex-col items-center gap-2">
      {!hidePreview &&
        (photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Profile photo" className="h-20 w-20 flex-shrink-0 rounded-full border border-border object-cover" />
        ) : (
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-border text-xs text-muted">
            No photo
          </div>
        ))}
      <form action={formAction} className="flex w-full min-w-0 flex-col items-stretch gap-1.5">
        <input
          type="file"
          name="file"
          accept="image/*"
          className="w-full min-w-0 max-w-full rounded-md border border-border px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-bg file:px-1.5 file:py-0.5 file:text-xs file:text-ink"
        />
        <Button type="submit" variant="outline" size="sm" pending={pending}>
          {showsReplace ? "Replace photo" : "Upload photo"}
        </Button>
        {state?.error && <p className="text-center text-xs text-danger">{state.error}</p>}
      </form>
    </div>
  );
}
