"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { WHATSAPP_LINK, WHATSAPP_DISPLAY } from "@/lib/constants";
import { signIn } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function LoginForm() {
  return (
    <Suspense>
      <LoginFormWithNext />
    </Suspense>
  );
}

function LoginFormWithNext() {
  const [state, formAction, pending] = useActionState(signIn, undefined);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";

  return (
    <>
      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-ink">
            Email
          </label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-ink">
            Password
          </label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>

        {state?.error && <p className="text-sm text-danger">{state.error}</p>}

        <Button type="submit" variant="primary" pending={pending} className="mt-2">
          Sign In
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Partner university?{" "}
        <a href="/register/partner" className="text-primary hover:underline">
          Register here
        </a>
      </p>
      <p className="mt-4 text-center text-xs text-muted">
        Need help? WhatsApp us at{" "}
        <a href={WHATSAPP_LINK} className="text-primary hover:underline">
          {WHATSAPP_DISPLAY}
        </a>
      </p>
    </>
  );
}
