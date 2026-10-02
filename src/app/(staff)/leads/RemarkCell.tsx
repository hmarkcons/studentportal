"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { LeadRemarkEditor } from "./LeadRemarkEditor";

/**
 * The Remarks column (0306): the lead's remark on one line, cut short with an
 * ellipsis when it does not fit, and the whole of it — to read, edit, and see
 * every earlier version of — in a pop-up on a click. No remark yet: "+ Add
 * remark", which opens the pop-up straight into the box.
 */
export function RemarkCell({
  leadId,
  leadName,
  remark,
  updatedAt,
  updatedBy,
}: {
  leadId: string;
  leadName: string;
  remark: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  const [open, setOpen] = useState(false);
  // What the cell shows, kept here so a save shows at once, before the page
  // has been read again.
  const [shown, setShown] = useState(remark);
  const [meta, setMeta] = useState({ at: updatedAt, by: updatedBy });

  return (
    <div data-remark-cell={leadId}>
      {shown ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block max-w-[16rem] truncate text-left text-sm text-ink hover:text-primary hover:underline"
          aria-label={`Remark on ${leadName}: ${shown} — open to read in full or edit`}
          data-remark-text
        >
          {shown}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-primary hover:underline" data-remark-add>
          + Add remark
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={`Remarks — ${leadName}`}>
        <div data-remark-dialog={leadId}>
          <LeadRemarkEditor
            leadId={leadId}
            remark={shown}
            updatedAt={meta.at}
            updatedBy={meta.by}
            startEditing={!shown}
            onSaved={(next, at, by) => {
              setShown(next);
              setMeta({ at, by });
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
