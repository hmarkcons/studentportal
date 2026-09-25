"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE, normalizeColor } from "@/lib/pdf/agreementTheme";

/**
 * A toolbar colour picker: the HMARK palette, any other colour, and a way to
 * take the colour off again. `swatch` is the colour currently applied, shown
 * as a bar under the button's label.
 */
export function ColorMenu({
  label,
  title,
  swatch,
  onPick,
  clearLabel = "No colour",
  disabled,
}: {
  label: React.ReactNode;
  title: string;
  swatch: string | null;
  onPick: (color: string | null) => void;
  clearLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(swatch ?? "#52be96");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const pick = (color: string | null) => {
    onPick(color);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        disabled={disabled}
        // Keeps the editor's selection: a mousedown on the button would otherwise blur it first.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 min-w-7 flex-col items-center justify-center rounded border border-border px-1.5 text-xs font-semibold text-ink hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="leading-none">{label}</span>
        <span className="mt-0.5 h-1 w-4 rounded-sm border border-border" style={{ background: swatch ?? "transparent" }} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={title}
          className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-border bg-card p-2 shadow-lg"
          onMouseDown={(e) => {
            // Clicks inside keep the editor's selection too — except in the colour field itself.
            if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
          }}
        >
          <div className="grid grid-cols-8 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                aria-label={c.label}
                onClick={() => pick(c.value)}
                className={`h-5 w-5 rounded border ${swatch === c.value ? "ring-2 ring-primary ring-offset-1" : "border-border"}`}
                style={{ background: c.value }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-border bg-card"
              aria-label="Choose any colour"
            />
            <button
              type="button"
              onClick={() => pick(normalizeColor(custom))}
              className="rounded border border-border px-2 py-1 text-xs text-ink hover:bg-bg"
            >
              Use this colour
            </button>
          </div>
          <button type="button" onClick={() => pick(null)} className="mt-2 w-full rounded px-2 py-1 text-left text-xs text-muted hover:bg-bg">
            {clearLabel}
          </button>
        </div>
      )}
    </div>
  );
}
