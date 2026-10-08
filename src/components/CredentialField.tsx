"use client";

import { useActionState, useState } from "react";
import { ExternalLink } from "lucide-react";
import { storeCredentialAction, readCredentialAction } from "@/lib/actions/countryTracker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SafeLink } from "@/components/SafeLink";
import type { StoredLogin } from "@/lib/portalLink";

/**
 * One saved login, as staff keep it: the username, the password and the page
 * it signs in to (src/lib/portalLink.ts). The username and password are typed
 * fresh — a field left blank keeps what is saved — and shown only on Reveal;
 * the link is no secret, so it is shown and opened directly, and its field
 * comes filled in: with the saved link, or else with one suggested from what
 * is on file (the programme's application portal, the scholarship body's
 * apply page), to change before saving.
 */
export function CredentialField({
  label,
  ownerType,
  ownerId,
  credentialType,
  revalidateTo,
  link = null,
  suggestedLink = null,
}: {
  label: string;
  ownerType: "student" | "application";
  ownerId: string;
  credentialType: string;
  revalidateTo: string;
  /** The login page saved with it. */
  link?: string | null;
  /** Offered when nothing is saved yet. */
  suggestedLink?: string | null;
}) {
  const action = storeCredentialAction.bind(null, ownerType, ownerId, credentialType, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [revealed, setRevealed] = useState<StoredLogin | null>(null);
  const [revealing, setRevealing] = useState(false);

  async function reveal() {
    setRevealing(true);
    const result = await readCredentialAction(ownerType, ownerId, credentialType);
    setRevealed(result);
    setRevealing(false);
  }

  const offered = link ?? suggestedLink;

  return (
    <div className="rounded-md border border-border p-3" data-credential={credentialType}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink">{label} (encrypted)</p>
        {link && (
          <SafeLink value={link} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
            Open login page
          </SafeLink>
        )}
      </div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <Input name="username" placeholder="Username / ID" className="w-36" aria-label={`${label} username`} />
        <Input name="password" type="password" placeholder="Password" className="w-36" aria-label={`${label} password`} />
        <Input
          name="link"
          defaultValue={offered ?? ""}
          // Text, not type=url: a bare "portal.unipi.it" is fine, and the
          // browser's own check would stop the form without saying why.
          type="text"
          inputMode="url"
          placeholder="Login page link (https://…)"
          aria-label={`${label} login page link`}
          className="min-w-48 flex-1"
        />
        <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
          Save
        </Button>
        <Button type="button" onClick={reveal} size="sm" pending={revealing}>
          Reveal
        </Button>
      </form>
      {!link && suggestedLink && (
        <p className="mt-1 text-[11px] text-muted" data-credential-suggested>
          Link suggested from what is on file — check it, then Save.
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted">A username or password left blank keeps the one saved.</p>
      {revealed && (
        <p className="mt-2 text-xs text-muted">
          {revealed.username ? `Username: ${revealed.username}` : "No username set"}
          {revealed.password && ` · Password: ${revealed.password}`}
          {revealed.link && " · "}
          {revealed.link && <SafeLink value={revealed.link} />}
        </p>
      )}
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
