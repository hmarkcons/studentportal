"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ImageUp, RotateCcw } from "lucide-react";
import { saveLoginScreen, uploadLoginPicture, resetLoginPicture } from "@/lib/actions/loginScreen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { LoginScreenView } from "@/components/login/LoginScreenView";
import {
  LOGIN_SCREEN_DEFAULTS,
  LOGIN_SCREEN_GROUPS,
  isHexColor,
  readLoginScreen,
  type LoginScreenContent,
  type LoginScreenKey,
} from "@/lib/loginScreen";

/**
 * The login page drawn at its real size, 1440×900, and scaled to the column
 * it sits in — so the preview is the page, not an approximation of it.
 */
function ScaledPreview({ children }: { children: React.ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1440));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={frame} className="relative w-full overflow-hidden rounded-xl border border-border bg-white shadow-sm" style={{ height: 900 * scale }}>
      <div className="pointer-events-none absolute left-0 top-0 origin-top-left select-none" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Setup → Login screen: every word on the login page, where its links go, its
 * two colours and its picture, beside a live preview that follows each
 * keystroke. A box left empty goes back to the original wording.
 */
export function LoginScreenForm({
  initial,
  pictureUrl,
  customPicture,
  year,
}: {
  initial: LoginScreenContent;
  pictureUrl: string;
  customPicture: boolean;
  year: number;
}) {
  const [values, setValues] = useState<LoginScreenContent>(initial);
  const [state, formAction, pending] = useActionState(saveLoginScreen, undefined);
  const [pictureState, pictureAction, picturePending] = useActionState(uploadLoginPicture, undefined);
  const [resetState, setResetState] = useState<{ error?: string; success?: boolean } | undefined>(undefined);
  const [resetting, startReset] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);

  // A chosen file shows in the preview before it is uploaded.
  useEffect(() => () => {
    if (chosen) URL.revokeObjectURL(chosen);
  }, [chosen]);

  const set = (key: LoginScreenKey, value: string) => setValues((v) => ({ ...v, [key]: value }));
  // What the page would show: blanks fall back, as they will once saved.
  const shown = readLoginScreen(values);

  return (
    <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-6">
        <Card>
          <form action={formAction} className="flex flex-col gap-6" data-login-screen-form>
            {LOGIN_SCREEN_GROUPS.map((group) => (
              <fieldset key={group.title} className="flex flex-col gap-3">
                <legend className="mb-1 text-sm font-semibold text-ink">{group.title}</legend>
                {group.fields.map((field) => (
                  <label key={field.key} className="flex flex-col gap-1 text-xs text-muted">
                    {field.label}
                    {field.kind === "color" ? (
                      <span className="flex items-center gap-2">
                        <input
                          type="color"
                          value={isHexColor(values[field.key]) ? values[field.key] : LOGIN_SCREEN_DEFAULTS[field.key]}
                          onChange={(e) => set(field.key, e.target.value)}
                          aria-label={`${field.label} — colour picker`}
                          className="h-9 w-12 cursor-pointer rounded-md border border-border bg-card p-1"
                        />
                        <Input
                          name={field.key}
                          value={values[field.key]}
                          maxLength={field.max}
                          placeholder={LOGIN_SCREEN_DEFAULTS[field.key]}
                          onChange={(e) => set(field.key, e.target.value)}
                          className="w-32 font-mono"
                        />
                        <span aria-hidden className="h-9 flex-1 rounded-md" style={{ background: shown[field.key] }} />
                      </span>
                    ) : field.kind === "textarea" ? (
                      <Textarea
                        name={field.key}
                        value={values[field.key]}
                        maxLength={field.max}
                        rows={2}
                        placeholder={LOGIN_SCREEN_DEFAULTS[field.key]}
                        onChange={(e) => set(field.key, e.target.value)}
                      />
                    ) : (
                      <Input
                        name={field.key}
                        inputMode={field.kind === "url" ? "url" : undefined}
                        value={values[field.key]}
                        maxLength={field.max}
                        placeholder={LOGIN_SCREEN_DEFAULTS[field.key]}
                        onChange={(e) => set(field.key, e.target.value)}
                      />
                    )}
                    {field.hint && <span className="text-[11px] text-muted">{field.hint}</span>}
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Saved — the login page shows this now.", showError: true }}>
                Save
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setValues(LOGIN_SCREEN_DEFAULTS)}>
                <RotateCcw aria-hidden className="h-3.5 w-3.5 shrink-0" />
                Fill in the original wording
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <h3 className="mb-1 text-sm font-semibold text-ink">Picture</h3>
          <p className="mb-3 text-xs text-muted">
            Shown at the bottom right of the story, fading into the page along its left and top edges. A picture about 1200×1100
            pixels, with its subject towards the right, sits best. JPG, PNG or WebP, up to 5 MB.
          </p>
          <form action={pictureAction} className="flex flex-wrap items-center gap-3" data-login-picture-form>
            <input
              type="file"
              name="picture"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setChosen(file ? URL.createObjectURL(file) : null);
              }}
              className="text-xs text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-xs file:text-ink"
            />
            <Button type="submit" variant="primary" size="sm" pending={picturePending} disabled={!chosen} status={{ state: pictureState, label: "Uploaded.", showError: true }}>
              <ImageUp aria-hidden className="h-3.5 w-3.5 shrink-0" />
              Upload picture
            </Button>
            {customPicture && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                pending={resetting}
                status={{ state: resetState, label: "Back to the original.", showError: true }}
                onClick={() =>
                  startReset(async () => {
                    const result = await resetLoginPicture();
                    setResetState(result);
                    if (result?.success) setChosen(null);
                  })
                }
              >
                <RotateCcw aria-hidden className="h-3.5 w-3.5 shrink-0" />
                Use the original picture
              </Button>
            )}
          </form>
        </Card>
      </div>

      <div className="2xl:sticky 2xl:top-20">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Preview — as the login page will look</p>
        <ScaledPreview>
          <LoginScreenView content={shown} pictureUrl={chosen ?? pictureUrl} year={year} preview />
        </ScaledPreview>
      </div>
    </div>
  );
}
