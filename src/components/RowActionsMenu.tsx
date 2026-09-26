"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteStudent } from "@/lib/actions/leads";
import { useButtonAction } from "@/components/useButtonAction";
import { ActionStatus } from "@/components/ActionStatus";
import { useAnchoredMenu } from "@/components/useAnchoredMenu";

export function RowActionsMenu({
  id,
  name,
  editHref,
  canDelete,
  deleteLabel = "Delete",
  deleteConfirm,
}: {
  id: string;
  name: string;
  editHref: string;
  canDelete: boolean;
  deleteLabel?: string;
  deleteConfirm?: string;
}) {
  const [open, setOpen] = useState(false);
  const del = useButtonAction();
  const pending = del.pending;
  const router = useRouter();
  // Beside its button on the screen, opening upwards when there is no room
  // below. It used to open below whatever was there, so the last row's menu
  // opened off the bottom of the screen — and closed the moment anything
  // scrolled to reach it. Escape and scrolling are the hook's.
  const { anchor: buttonRef, menu: menuRef, style: menuStyle, portal } = useAnchoredMenu(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, menuRef, buttonRef]);

  function toggle() {
    setOpen((v) => !v);
  }

  async function handleDelete() {
    setOpen(false);
    if (
      !confirm(
        deleteConfirm ??
          `Permanently delete ${name}? This removes ALL of their data — applications, documents, agreements, invoices, commissions, tasks, and portal access. This cannot be undone.`
      )
    ) {
      return;
    }
    // The row goes once this lands, so success is a toast; a refusal is said
    // beside the ⋮ that is still there, where an alert() used to be.
    await del.run(
      async () => {
        const result = await deleteStudent(id);
        if (!result?.error) router.refresh();
        return result;
      },
      { toast: "Deleted." }
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label="Row actions"
        className="rounded-md px-2 py-1 text-muted hover:bg-bg hover:text-ink disabled:opacity-50"
      >
        {pending ? "…" : "⋮"}
      </button>
      <ActionStatus state={del.state} pending={pending} label="Deleted." showError />
      {open &&
        portal(
          <div ref={menuRef} style={menuStyle} data-menu className="z-50 w-36 rounded-md border border-border bg-card py-1 shadow-md">
            <Link href={editHref} onClick={() => setOpen(false)} className="block px-3 py-1.5 text-sm text-ink hover:bg-bg">
              Modify
            </Link>
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                data-full-width
                className="block w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-bg"
              >
                {deleteLabel}
              </button>
            )}
          </div>
        )}
    </span>
  );
}
