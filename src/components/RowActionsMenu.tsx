"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteStudent } from "@/lib/actions/leads";

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
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [pending, setPending] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
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
    setPending(true);
    const result = await deleteStudent(id);
    if (result?.error) {
      alert(result.error);
      setPending(false);
    } else {
      router.refresh();
    }
  }

  return (
    <>
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
      {open && pos && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-50 w-36 rounded-md border border-border bg-card py-1 shadow-md"
        >
          <Link href={editHref} onClick={() => setOpen(false)} className="block px-3 py-1.5 text-sm text-ink hover:bg-bg">
            Modify
          </Link>
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="block w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-bg"
            >
              {deleteLabel}
            </button>
          )}
        </div>
      )}
    </>
  );
}
