"use client";

import { useState } from "react";
import { toggleApplicationTask, deleteApplicationTask } from "@/lib/actions/applications";
import { Badge } from "@/components/ui/Badge";

const PRIORITY_TONE: Record<string, "danger" | "warning" | "neutral"> = {
  urgent: "danger",
  medium: "warning",
  low: "neutral",
};

export function CalendarTaskRow({ taskId, label, priority, tone }: { taskId: string; label: string; priority: string; tone: "warning" | "danger" | "info" }) {
  const [done, setDone] = useState(false);

  return (
    <div className="flex items-center justify-between text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => {
            setDone(e.target.checked);
            toggleApplicationTask(taskId, "/calendar", e.target.checked);
          }}
        />
        <span className={done ? "text-muted line-through" : "text-ink"}>{label}</span>
      </label>
      <div className="flex items-center gap-2">
        <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{priority}</Badge>
        <Badge tone={tone}>Task</Badge>
        <button onClick={() => deleteApplicationTask(taskId, "/calendar")} className="text-xs text-muted hover:text-danger">
          🗑️
        </button>
      </div>
    </div>
  );
}
