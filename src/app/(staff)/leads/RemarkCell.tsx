"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useHoverPreview } from "@/components/ui/useHoverPreview";
import { LeadRemarkEditor, type RemarkStore } from "./LeadRemarkEditor";

/**
 * The Remarks column (0306): the lead's remark on one line, cut short with an
 * ellipsis when it does not fit. Resting the pointer on a cut-short remark
 * shows the whole of it beside the cell; a click opens it — to read, edit, and
 * see every earlier version of — in a pop-up. No remark yet: "+ Add remark",
 * which opens the pop-up straight into the box.
 */
export function RemarkCell({
  leadId,
  leadName,
  remark,
  updatedAt,
  updatedBy,
  onSaved,
  store,
}: {
  /** Whose remark: the lead's id, or the application's with an application store. */
  leadId: string;
  /** What the pop-up is titled with: the lead, or the student and university. */
  leadName: string;
  remark: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Told what was saved, so a list that draws only the rows in view keeps it when this row is drawn again. */
  onSaved?: (remark: string | null, at: string | null, by: string | null) => void;
  /** An application's remarks rather than a lead's. */
  store?: RemarkStore;
}) {
  const [open, setOpen] = useState(false);
  // Built the first time it is asked for, not with the row (see LongTextCell).
  const [everOpened, setEverOpened] = useState(false);
  // What the cell shows, kept here so a save shows at once, before the page
  // has been read again.
  const [shown, setShown] = useState(remark);
  const [meta, setMeta] = useState({ at: updatedAt, by: updatedBy });
  const textRef = useRef<HTMLButtonElement>(null);
  const [cut, setCut] = useState(false);
  const hover = useHoverPreview(shown, cut);
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCut(el.scrollWidth > el.clientWidth + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);
  const openEditor = () => {
    hover.close();
    setEverOpened(true);
    setOpen(true);
  };

  return (
    <div data-remark-cell={leadId}>
      {shown ? (
        <button
          ref={textRef}
          type="button"
          onClick={openEditor}
          className="block max-w-[16rem] truncate text-left text-sm text-ink hover:text-primary hover:underline"
          aria-label={`Remark on ${leadName}: ${shown} — open to read in full or edit`}
          data-remark-text
          data-cut={cut || undefined}
          {...hover.bind}
        >
          {shown}
        </button>
      ) : (
        <button type="button" onClick={openEditor} className="text-xs font-medium text-primary hover:underline" data-remark-add>
          + Add remark
        </button>
      )}
      {hover.preview}
      {everOpened && (
        <Modal open={open} onClose={() => setOpen(false)} title={`Remarks — ${leadName}`}>
          <div data-remark-dialog={leadId}>
            <LeadRemarkEditor
              leadId={leadId}
              remark={shown}
              updatedAt={meta.at}
              updatedBy={meta.by}
              startEditing={!shown}
              store={store}
              onSaved={(next, at, by) => {
                setShown(next);
                setMeta({ at, by });
                onSaved?.(next, at, by);
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
