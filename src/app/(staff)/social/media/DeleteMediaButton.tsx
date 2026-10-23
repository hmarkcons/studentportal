"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteMediaAsset } from "@/lib/actions/socialMedia";

export function DeleteMediaButton({ assetId }: { assetId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label="Delete this media"
        title="Delete"
        onClick={() => {
          if (!window.confirm("Delete this media? It is removed from storage.")) return;
          setError(null);
          start(async () => {
            const r = await deleteMediaAsset(assetId);
            if (r?.error) setError(r.error);
          });
        }}
        className="absolute right-1.5 top-1.5 rounded-md bg-black/55 p-1 text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100 disabled:opacity-50"
      >
        <Trash2 aria-hidden className="h-3.5 w-3.5" />
      </button>
      {error && <p className="absolute inset-x-1 bottom-1 rounded bg-danger px-1 text-[10px] text-white">{error}</p>}
    </>
  );
}
