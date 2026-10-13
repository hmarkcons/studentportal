"use client";

import { useActionState, useState } from "react";
import { ExternalLink } from "lucide-react";
import { storeCredentialAction, readCredentialAction } from "@/lib/actions/countryTracker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SafeLink } from "@/components/SafeLink";
import { LoginDetails } from "@/components/LoginDetails";
import type { StoredLogin } from "@/lib/portalLink";

/**
 * Keeps the browser's password manager, and the usual extensions', out of a
 * field that holds somebody else's login.
 *
 * A password-type input here made the browser offer the staff member's own
 * saved logins, fill one in unasked, and offer to save the student's password
 * under this portal — where it was then offered back on the sign-in page. With
 * no password-type input there is no login form for it to recognise; the
 * password is masked by CSS instead, and the names say nothing it knows.
 */
export const NOT_A_SIGN_IN = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

/**
 * One saved login, as staff keep it: the username, the password and the page
 * it signs in to (src/lib/portalLink.ts). The username and password are typed
 * fresh — a field left blank keeps what is saved — and shown only on Reveal,
 * large, to read out or copy; the link is no secret, so it is shown and opened
 * directly, and its field comes filled in: with the saved link, or else with
 * one suggested from what is on file (the programme's application portal, the
 * scholarship body's apply page), to change before saving.
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
  const [nothingSaved, setNothingSaved] = useState(false);

  async function reveal() {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setRevealing(true);
    const result = await readCredentialAction(ownerType, ownerId, credentialType);
    setRevealing(false);
    const empty = !result || (!result.username && !result.password && !result.link);
    setNothingSaved(empty);
    setRevealed(empty ? null : result);
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
      <form action={formAction} autoComplete="off" className="flex flex-wrap items-center gap-2">
        <Input name="login_user" {...NOT_A_SIGN_IN} placeholder="Username / ID" className="w-36" aria-label={`${label} username`} />
        <Input
          name="login_secret"
          {...NOT_A_SIGN_IN}
          type="text"
          placeholder="Password"
          // Masked as a password field would be, without being one.
          className="w-36 [-webkit-text-security:disc]"
          aria-label={`${label} password`}
        />
        <Input
          name="link"
          {...NOT_A_SIGN_IN}
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
          {revealed ? "Hide" : "Reveal"}
        </Button>
      </form>
      {!link && suggestedLink && (
        <p className="mt-1 text-[11px] text-muted" data-credential-suggested>
          Link suggested from what is on file — check it, then Save.
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted">A username or password left blank keeps the one saved.</p>
      {revealed && (
        <LoginDetails
          className="mt-3"
          label={label}
          credentialType={credentialType}
          username={revealed.username}
          password={revealed.password}
          link={revealed.link}
          onHide={() => setRevealed(null)}
        />
      )}
      {nothingSaved && !revealed && <p className="mt-2 text-xs text-muted">Nothing is saved for this login yet.</p>}
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
