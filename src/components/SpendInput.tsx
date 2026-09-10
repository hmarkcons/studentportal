"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";

/**
 * An amount saved when you leave the field.
 *
 * Shared because the campaigns page needed the same control the ad campaigns
 * table already had: campaigns.actual_spend has been displayed since the
 * beginning with nothing able to write it, so every campaign read as having
 * cost nothing.
 *
 * Two things the original did not do. It returned early on an empty value, so
 * a figure entered by mistake could never be cleared — and it said nothing at
 * all on success, which matters when the write can be refused: a marketing
 * user typing into the ad table had the value accepted on screen and silently
 * dropped, because that table belongs to Digital Marketing.
 */
export function SpendInput({
  value,
  onSave,
  placeholder = "Actual spend",
  className = "w-28",
}: {
  value: number | string | null;
  onSave: (next: string) => Promise<{ error?: string; success?: boolean } | void>;
  placeholder?: string;
  className?: string;
}) {
  const initial = value === null || value === undefined ? "" : String(value);
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");

  async function commit() {
    if (text.trim() === saved.trim()) return;
    setError(null);
    setState("saving");
    const result = await onSave(text);
    if (result && "error" in result && result.error) {
      setError(result.error);
      // Put the stored figure back, so the screen never shows a number the
      // database does not hold.
      setText(saved);
      setState("idle");
      return;
    }
    setSaved(text);
    setState("done");
  }

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <Input
        type="number"
        step="0.01"
        min="0"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setState("idle");
        }}
        onBlur={commit}
        placeholder={placeholder}
        className={className}
      />
      {state === "saving" && <span className="text-[10px] text-muted">Saving…</span>}
      {state === "done" && <span className="text-[10px] text-success">Saved</span>}
      {error && <span className="max-w-[14rem] text-right text-[10px] text-danger">{error}</span>}
    </div>
  );
}
