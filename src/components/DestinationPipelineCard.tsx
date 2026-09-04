"use client";

import { useState, useTransition } from "react";
import { setDashboardStageValue } from "@/lib/actions/dashboardPipeline";
import {
  currentStageIndex,
  isNegativeValue,
  type DashboardStageDef,
  type DashboardStageValues,
} from "@/lib/dashboardPipeline";
import { Select, Input } from "@/components/ui/Input";

function StageField({
  leadId,
  destinationId,
  revalidateTo,
  stage,
  value,
}: {
  leadId: string;
  destinationId: string;
  revalidateTo: string;
  stage: DashboardStageDef;
  value: string | undefined;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(next: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await setDashboardStageValue(leadId, destinationId, stage.key, revalidateTo, next);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted">{stage.label}</label>
      {stage.type === "checkbox" && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={pending}
            onChange={(e) => set(e.target.checked ? stage.options[0] : null)}
            className="h-4 w-4"
          />
          {stage.options[0]}
        </label>
      )}
      {stage.type === "select" && (
        <Select value={value ?? ""} disabled={pending} onChange={(e) => set(e.target.value || null)}>
          <option value="">—</option>
          {stage.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      )}
      {stage.type === "date" && (
        <Input type="date" defaultValue={value ?? ""} disabled={pending} onChange={(e) => set(e.target.value || null)} />
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function DestinationPipelineCard({
  leadId,
  destinationId,
  destinationName,
  subtitle,
  stages,
  values,
  editable,
  revalidateTo,
}: {
  leadId: string;
  destinationId: string;
  destinationName: string;
  subtitle: string;
  stages: DashboardStageDef[];
  values: DashboardStageValues;
  editable: boolean;
  revalidateTo: string;
}) {
  const [editing, setEditing] = useState(false);
  const idx = currentStageIndex(stages, values);
  const currentValue = values[stages[idx]?.key];
  const currentIsNegative = isNegativeValue(currentValue);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between bg-primary px-5 py-4 text-primary-ink">
        <div>
          <p className="text-sm font-semibold">{destinationName}</p>
          <p className="text-xs opacity-90">{subtitle}</p>
        </div>
        {editable && (
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs underline">
            {editing ? "Done" : "Update stages"}
          </button>
        )}
      </div>

      <div className="relative border-t border-dashed border-border px-5 py-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {stages.map((stage, i) => {
            const value = values[stage.key];
            const negative = isNegativeValue(value);
            const filled = i < idx || (i === idx && Boolean(value));
            return (
              <div key={stage.key} className="flex min-w-[72px] flex-1 flex-col items-center gap-1">
                <span className={`text-center text-[10px] leading-tight ${i === idx ? "font-medium text-ink" : "text-muted"}`}>
                  {stage.label}
                </span>
                <div
                  className={`h-1.5 w-full rounded-full ${
                    filled ? (i === idx && negative ? "bg-danger" : "bg-primary") : "bg-border"
                  }`}
                />
                <span className={`text-center text-[9px] leading-tight ${negative ? "text-danger" : "text-muted"}`}>{value ?? "—"}</span>
              </div>
            );
          })}
        </div>
        {currentIsNegative && (
          <p className="mt-2 text-xs text-danger">
            {stages[idx]?.label}: {currentValue}
          </p>
        )}
      </div>

      {editable && editing && (
        <div className="border-t border-border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {stages.map((stage) => (
              <StageField
                key={stage.key}
                leadId={leadId}
                destinationId={destinationId}
                revalidateTo={revalidateTo}
                stage={stage}
                value={values[stage.key]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
