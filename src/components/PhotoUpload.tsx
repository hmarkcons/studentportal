"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";
import { MAX_PHOTO_BYTES } from "@/lib/fileSize";
import { ActionStatus } from "@/components/ActionStatus";

type PhotoUploadState = { error?: string; success?: boolean } | undefined;

export function PhotoUpload({
  action,
  photoUrl,
  hidePreview = false,
  hasPhoto,
  onDelete,
  deleteLabel,
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
  /**
   * Removes the photo entirely. Omitted where the viewer may not — a staff
   * member's photo is the Super Admin's to change, so everyone else gets the
   * picture and no controls at all.
   */
  onDelete?: () => Promise<{ error?: string; success?: boolean } | undefined>;
  /** What the confirmation asks about, e.g. "Ali Raza's photo". */
  deleteLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [ready, setReady] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const showsReplace = hasPhoto ?? Boolean(photoUrl);

  async function remove() {
    if (!onDelete) return;
    if (!confirm(`Remove ${deleteLabel ?? "this photo"}? The picture is deleted, not just hidden.`)) return;
    setRemoving(true);
    setRemoveError(null);
    const result = await onDelete();
    if (result?.error) setRemoveError(result.error);
    setRemoving(false);
  }

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
        {/* 500 KB, lower than everything else: a head-and-shoulders photo has
            no reason to be larger, and a phone photo is resized to fit rather
            than refused, so the smaller limit costs nobody anything. */}
        <FileField
          accept="image/jpeg,image/png,image/webp"
          limitBytes={MAX_PHOTO_BYTES}
          noun="photo"
          hint="JPG or PNG"
          onChange={(s) => setReady(Boolean(s.file))}
          inputClassName="w-full min-w-0 rounded-md border border-border px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-bg file:px-1.5 file:py-0.5 file:text-xs file:text-ink"
        />
        <Button type="submit" variant="outline" size="sm" pending={pending} disabled={!ready}>
          {showsReplace ? "Replace photo" : "Upload photo"}
        </Button>
        <ActionStatus state={state} pending={pending} label="Photo uploaded." />
        {state?.error && <p className="text-center text-xs text-danger">{state.error}</p>}
      </form>

      {/* Only where there is something to remove. A Remove control beside an
          empty circle is a button that can only ever fail. */}
      {onDelete && showsReplace && (
        <>
          <button
            type="button"
            onClick={remove}
            disabled={removing}
            className="text-xs text-danger hover:underline disabled:opacity-40"
          >
            {removing ? "Removing…" : "Remove photo"}
          </button>
          {removeError && <p className="text-center text-xs text-danger">{removeError}</p>}
        </>
      )}
    </div>
  );
}
