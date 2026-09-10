"use client";

import { useState } from "react";

/**
 * One documentation tracker per country, as tabs.
 *
 * A student registered for a primary country and one or two backups had every
 * country's tracker stacked in one card — three sets of twenty-odd fields, one
 * after another, with only a small country name between them. There is one
 * tracker per country and there always was; this is about being able to look at
 * one of them.
 *
 * Panels stay mounted and hidden rather than unmounted, so a half-filled
 * tracker is not thrown away by looking at another country — the same reason
 * the document sections do it.
 */
export function TrackerCountryTabs({
  tabs,
}: {
  tabs: { code: string; label: string; isBackup: boolean; filled: number; total: number; content: React.ReactNode }[];
}) {
  // The primary country first, which the caller has already ordered.
  const [active, setActive] = useState(tabs[0]?.code ?? "");

  if (tabs.length === 0) return null;

  return (
    <div>
      {/* One country needs no tab strip — it would be a single button above
          the only thing it could show. */}
      {tabs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
          {tabs.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => setActive(t.code)}
              aria-pressed={t.code === active}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                t.code === active ? "bg-primary text-primary-ink" : "border border-border text-muted hover:text-ink"
              }`}
            >
              {t.label}
              {t.isBackup && <span className="ml-1 font-normal opacity-80">(backup)</span>}
              {/* How much of that country's tracker is done, so a tab nobody
                  has started is obvious without opening it. */}
              <span className="ml-1.5 font-normal opacity-80">
                {t.filled}/{t.total}
              </span>
            </button>
          ))}
        </div>
      )}

      {tabs.map((t) => (
        <div key={t.code} hidden={t.code !== active}>
          {tabs.length === 1 && <p className="mb-2 text-xs font-medium text-muted">{t.label}</p>}
          {t.content}
        </div>
      ))}
    </div>
  );
}
