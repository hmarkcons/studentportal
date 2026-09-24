"use client";

import { useActionState, useState } from "react";
import { saveLoginFigures } from "@/lib/actions/loginScreen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { LoginFigureTiles } from "@/components/LoginFigureTiles";
import {
  LOGIN_FIGURE_ICON_LABELS,
  LOGIN_FIGURE_ICONS,
  MAX_LABEL_LENGTH,
  MAX_LOGIN_FIGURES,
  MAX_VALUE_LENGTH,
  type LoginFigure,
} from "@/lib/loginFigures";

/** Each figure's number, label and icon, with a preview drawn the way the login page draws it. */
export function LoginFiguresForm({ initial }: { initial: LoginFigure[] }) {
  const [state, formAction, pending] = useActionState(saveLoginFigures, undefined);
  const [rows, setRows] = useState<LoginFigure[]>(initial);
  const set = (i: number, patch: Partial<LoginFigure>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const shown = rows.filter((r) => r.value.trim() && r.label.trim());

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form action={formAction} className="flex flex-col gap-3" data-login-figures-form>
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="flex w-24 flex-col gap-1 text-xs text-muted">
                Number
                <Input name={`value_${i}`} value={row.value} maxLength={MAX_VALUE_LENGTH} placeholder="7500+" onChange={(e) => set(i, { value: e.target.value })} />
              </label>
              <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted">
                Label
                <Input name={`label_${i}`} value={row.label} maxLength={MAX_LABEL_LENGTH} placeholder="Admissions" onChange={(e) => set(i, { label: e.target.value })} />
              </label>
              <label className="flex w-56 flex-col gap-1 text-xs text-muted">
                Icon
                <Select name={`icon_${i}`} value={row.icon} onChange={(e) => set(i, { icon: e.target.value as LoginFigure["icon"] })}>
                  {LOGIN_FIGURE_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {LOGIN_FIGURE_ICON_LABELS[icon]}
                    </option>
                  ))}
                </Select>
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} disabled={rows.length <= 1} aria-label={`Remove figure ${i + 1}`}>
                Remove
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {rows.length < MAX_LOGIN_FIGURES && (
              <Button type="button" variant="outline" size="sm" onClick={() => setRows((r) => [...r, { value: "", label: "", icon: "star" }])}>
                + Add a figure
              </Button>
            )}
            <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Saved — the login screen shows these now.", showError: true }}>
              Save
            </Button>
          </div>
        </form>
      </Card>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Preview</p>
        <div className="rounded-2xl p-5" style={{ background: "linear-gradient(140deg, #173f33 0%, #1f6b52 45%, #2e9a74 100%)" }}>
          <LoginFigureTiles figures={shown} />
        </div>
      </div>
    </div>
  );
}
