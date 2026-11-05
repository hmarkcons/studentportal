"use client";

import { useActionState, useEffect, useState } from "react";
import { searchEmailPreviewContacts, sendTemplateTest } from "@/lib/actions/emailTemplates";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Contact = { id: string; full_name: string | null; email: string | null };

const WIDTH = { desktop: 680, mobile: 375 } as const;

/**
 * The email as recipients will see it — desktop or phone width, light or
 * (imitated) dark mode, filled in as the sample contact or a real one — and
 * a test send to up to five addresses, filled in the same way.
 */
export function TemplateWorkbench({ versionId, templateName, canSendTest }: { versionId: string; templateName: string; canSendTest: boolean }) {
  const [device, setDevice] = useState<keyof typeof WIDTH>("desktop");
  const [dark, setDark] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);

  // Asked a quarter-second after typing stops; under two letters, nothing is shown.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      setResults(await searchEmailPreviewContacts(query));
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  const shownResults = query.trim().length >= 2 ? results : [];

  const params = new URLSearchParams();
  if (contact) params.set("contact", contact.id);
  if (dark) params.set("dark", "1");
  // toString(), not .size: Safari 16, which the portal still supports, has no URLSearchParams.size.
  const query_ = params.toString();
  const src = `/api/marketing/email-preview/${versionId}${query_ ? `?${query_}` : ""}`;

  const test = sendTemplateTest.bind(null, versionId);
  const [testState, testAction, testPending] = useActionState(test, undefined);

  const toggle = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-xs ${on ? "bg-primary text-primary-ink" : "border border-border text-ink hover:bg-bg"}`;

  return (
    <div className="flex flex-col gap-3" data-email-workbench>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Width">
          <button type="button" className={toggle(device === "desktop")} onClick={() => setDevice("desktop")} data-preview-desktop>
            Desktop
          </button>
          <button type="button" className={toggle(device === "mobile")} onClick={() => setDevice("mobile")} data-preview-mobile>
            Mobile
          </button>
        </div>
        <div className="flex gap-1" role="group" aria-label="Colour scheme">
          <button type="button" className={toggle(!dark)} onClick={() => setDark(false)}>
            Light
          </button>
          <button type="button" className={toggle(dark)} onClick={() => setDark(true)} data-preview-dark>
            Dark
          </button>
        </div>
        <a href={src} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
          Open in a new tab
        </a>
      </div>

      <div className="relative flex flex-col gap-1">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Preview as
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={contact ? `${contact.full_name ?? contact.email} — type to change` : "Sample contact (Ayesha Khan) — type a lead's name or email"}
            className="max-w-md"
            data-preview-as
          />
        </label>
        {contact && (
          <button type="button" onClick={() => setContact(null)} className="w-fit text-[11px] text-primary hover:underline">
            Back to the sample contact
          </button>
        )}
        {(shownResults.length > 0 || searching) && (
          <ul className="absolute top-full z-10 mt-1 w-full max-w-md overflow-hidden rounded-md border border-border bg-card shadow-lg">
            {searching && <li className="px-3 py-2 text-xs text-muted">Searching…</li>}
            {shownResults.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-xs hover:bg-bg"
                  onClick={() => {
                    setContact(r);
                    setQuery("");
                    setResults([]);
                  }}
                >
                  <span className="text-ink">{r.full_name ?? "—"}</span> <span className="text-muted">{r.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-bg p-3">
        <iframe
          key={src}
          src={src}
          title={`Preview of ${templateName}`}
          // The page itself is served with a sandbox policy; this says the same at the frame.
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          className="mx-auto block rounded border border-border bg-white"
          style={{ width: WIDTH[device], maxWidth: "100%", height: 720 }}
          data-email-preview-frame
        />
      </div>
      {dark && (
        <p className="text-[11px] text-muted">
          Dark mode is an imitation of what Gmail and Outlook&rsquo;s apps do; each client darkens an email its own way.
        </p>
      )}

      {canSendTest && (
        <form action={testAction} className="flex flex-col gap-2 rounded-lg border border-border p-3" data-email-test-form>
          <p className="text-sm font-medium text-ink">Send a test</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              To — up to 5 addresses, separated by commas
              <Input name="to" required placeholder="you@hmarkconsultants.com" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Subject <span className="text-[10px]">(sent as “[Test] …”)</span>
              <Input name="subject" defaultValue={templateName} maxLength={200} />
            </label>
          </div>
          <input type="hidden" name="contact_id" value={contact?.id ?? ""} />
          <p className="text-[11px] text-muted">
            Filled in as {contact ? (contact.full_name ?? contact.email) : "the sample contact"}. Tests are never counted in a
            campaign&rsquo;s report; the unsubscribe and preferences links in a test open a page that says so.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="outline-primary" size="sm" pending={testPending}>
              Send test
            </Button>
            {testState && "error" in testState && <p className="text-xs text-danger">{testState.error}</p>}
            {testState && "success" in testState && <p className="text-xs text-success">{testState.message}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
