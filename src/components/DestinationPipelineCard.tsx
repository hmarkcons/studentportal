"use client";

import { useState } from "react";
import { useButtonAction } from "@/components/useButtonAction";
import { ActionStatus } from "@/components/ActionStatus";
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
  // Each field saves as it changes; the confirmation or the refusal sits
  // beside it, and the field is held while the save is in flight.
  const save = useButtonAction();
  const pending = save.pending;

  function set(next: string | null) {
    void save.run(() => setDashboardStageValue(leadId, destinationId, stage.key, revalidateTo, next));
  }
  const status = <ActionStatus state={save.state} pending={pending} label="Saved." showError />;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted">{stage.label}</label>
      {stage.type === "checkbox" && (
        // The status sits outside the label: inside it, clicking the message
        // would tick the box.
        <div className="flex flex-wrap items-center gap-2">
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
          {status}
        </div>
      )}
      {stage.type === "select" && (
        <div className="flex flex-wrap items-center gap-2">
        <Select value={value ?? ""} disabled={pending} onChange={(e) => set(e.target.value || null)}>
          <option value="">—</option>
          {stage.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
        {status}
        </div>
      )}
      {stage.type === "date" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" defaultValue={value ?? ""} disabled={pending} onChange={(e) => set(e.target.value || null)} />
          {status}
        </div>
      )}
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
        {/* Wraps rather than scrolls — see BoardingPassTracker: a few pixels
            of overhang read as a truncated label, not as a scrollable row.
            Grid keeps the column width equal on every row. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-x-1 gap-y-3 pb-1">
          {stages.map((stage, i) => {
            const value = values[stage.key];
            const negative = isNegativeValue(value);
            const filled = i < idx || (i === idx && Boolean(value));
            return (
              <div key={stage.key} className="flex flex-col items-center gap-1">
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
