"use client";

import { useEffect, useRef, useState } from "react";
import { readCredentialAction } from "@/lib/actions/countryTracker";
import { Button } from "@/components/ui/Button";

/** Nothing is revealed for longer than this without being asked for again. */
const HIDE_AFTER_MS = 60_000;

/**
 * The student's own login for the visa appointment portal.
 *
 * It is theirs — staff record it so they can book on the student's behalf, and
 * read_credential has always allowed a student to read their own. What was
 * missing was anywhere for them to see it, which meant asking their counsellor
 * for their own password.
 *
 * Hidden until asked for, and hidden again a minute later. Not because the
 * viewer is not entitled to it, but because this page gets opened on shared
 * screens and in front of families, and a password sitting in the open is a
 * different thing from a password you chose to look at.
 */
export function VisaCredentials({
  studentId,
  credentialType,
  label,
}: {
  studentId: string;
  credentialType: string;
  label: string;
}) {
  const [value, setValue] = useState<{ username: string; password: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clears the countdown if the student navigates away mid-reveal, so a later
  // render cannot be hidden by a timer from a page that is gone.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function reveal() {
    setPending(true);
    setError(null);
    const result = await readCredentialAction("student", studentId, credentialType);
    setPending(false);
    if (!result) {
      setError("That login could not be read. Ask your counsellor to check it.");
      return;
    }
    setValue(result);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setValue(null), HIDE_AFTER_MS);
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setValue(null);
  }

  async function copy(what: "username" | "password") {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value[what]);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // A browser that refuses the clipboard still shows the text to read.
      setError("Your browser would not let the page copy that — select it and copy by hand.");
    }
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        {value ? (
          <Button type="button" size="sm" onClick={hide}>
            Hide
          </Button>
        ) : (
          <Button type="button" size="sm" variant="primary" pending={pending} onClick={reveal}>
            Show my login
          </Button>
        )}
      </div>

      {!value && !error && (
        <p className="mt-1 text-xs text-muted">
          Your own login for this portal, kept for you. It is hidden until you ask for it, and hides itself again a
          minute later.
        </p>
      )}

      {value && (
        <div className="mt-2 flex flex-col gap-2">
          {([
            ["Username", "username"],
            ["Password", "password"],
          ] as const).map(([name, key]) =>
            value[key] ? (
              <div key={key} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-20 shrink-0 text-xs text-muted">{name}</span>
                <code className="min-w-0 flex-1 break-all rounded bg-bg px-2 py-1 text-xs text-ink">{value[key]}</code>
                <Button type="button" size="sm" onClick={() => copy(key)}>
                  {copied === key ? "Copied" : "Copy"}
                </Button>
              </div>
            ) : null
          )}
          <p className="text-[11px] text-muted">Hides itself in a minute. Press Show again whenever you need it.</p>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
