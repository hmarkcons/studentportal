"use client";

import { useActionState, useState } from "react";
import { CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { signIn } from "@/app/login/actions";
import type { LoginScreenContent } from "@/lib/loginScreen";

/** A link that leaves the site opens beside it, so the sign-in stays where it was. */
function linkProps(url: string) {
  return url.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" };
}

/**
 * The sign-in, one form for everyone: a student with their Student ID or
 * email, staff of every role and partner universities with their email. There
 * is nothing to choose first — the server reads an @ as an email and anything
 * else as a Student ID (actions.ts), which is all the two tabs this replaced
 * ever changed.
 *
 * `preview` is the Setup page's live copy: drawn exactly the same, submitting
 * nothing. `next` is where to go once signed in, read by the page from the
 * address — a scanned QR check-in link, a page the proxy turned away.
 */
export function LoginForm({ content, next = "", preview = false }: { content: LoginScreenContent; next?: string; preview?: boolean }) {
  const [state, formAction, pending] = useActionState(signIn, undefined);
  const [showPassword, setShowPassword] = useState(false);

  // Compact: the fields a size smaller than a form that fills its panel, so
  // the white around them does the work.
  const input =
    "mt-1.5 h-11 w-full rounded-lg border border-[#d5dfda] bg-white px-3.5 text-[14.5px] text-[var(--login-heading)] outline-none transition placeholder:text-[#8a94a3] focus:border-[var(--login-accent)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--login-accent)_14%,transparent)]";

  return (
    <form action={preview ? undefined : formAction} className="mt-6" data-login-form>
      <input type="hidden" name="next" value={next} />

      <label htmlFor="login-identifier" className="block text-[13.5px] font-semibold text-[var(--login-heading)]">
        Email or Student ID
      </label>
      {/* Named "email" whatever it holds — password managers and the checks
          look for that — and a text field, because a Student ID is not an
          email address and the browser would refuse it. */}
      <input
        id="login-identifier"
        name="email"
        type="text"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        autoComplete="username"
        placeholder="Your email or Student ID"
        aria-describedby="login-identifier-hint"
        className={input}
      />
      <p id="login-identifier-hint" className="mt-1.5 text-[12px] text-[#6b7686]" data-login-identifier-hint>
        Students can sign in with their Student ID too.
      </p>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <label htmlFor="login-password" className="text-[13.5px] font-semibold text-[var(--login-heading)]">
          Password
        </label>
        <a
          href={content.forgotUrl}
          {...linkProps(content.forgotUrl)}
          className="text-[13px] font-semibold text-[var(--login-accent)] hover:underline"
          data-forgot-password
        >
          Forgot password?
        </a>
      </div>
      <div className="relative">
        <input
          id="login-password"
          name="password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="current-password"
          placeholder="Enter your password"
          className={`${input} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          className="absolute right-1.5 top-1/2 mt-[3px] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#56627a] transition hover:bg-[#f1f4f3] hover:text-[var(--login-heading)]"
        >
          {showPassword ? <EyeOff aria-hidden className="h-[18px] w-[18px]" /> : <Eye aria-hidden className="h-[18px] w-[18px]" />}
        </button>
      </div>

      <label className="mt-4 flex w-fit cursor-pointer items-center gap-2.5 text-[14px] text-[#3d4b63]">
        <input
          type="checkbox"
          name="remember"
          className="h-4 w-4 cursor-pointer rounded border-[#b8c4bf] accent-[var(--login-accent)]"
          data-keep-signed-in
        />
        Keep me signed in
      </label>

      {state?.error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b42318]" data-login-error>
          <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <button
        type={preview ? "button" : "submit"}
        disabled={pending}
        aria-busy={pending || undefined}
        data-full-width
        className="relative mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-[var(--login-accent)] text-[15px] font-bold text-white shadow-[0_12px_24px_-14px_var(--login-accent)] transition hover:-translate-y-px hover:bg-[color-mix(in_srgb,var(--login-accent)_88%,black)] disabled:cursor-wait disabled:opacity-80"
      >
        {pending ? (
          <>
            <LoaderCircle aria-hidden className="absolute h-5 w-5 animate-spin" />
            <span className="opacity-0">Sign in</span>
          </>
        ) : (
          "Sign in"
        )}
      </button>

      <div className="mt-6 border-t border-[#e6ebe9] pt-5 text-center text-[13.5px] text-[#4a5568]">
        {content.signupPrompt}{" "}
        <a href={content.signupUrl} {...linkProps(content.signupUrl)} className="font-semibold text-[var(--login-accent)] hover:underline" data-signup-link>
          {content.signupLabel}
        </a>
      </div>
    </form>
  );
}
