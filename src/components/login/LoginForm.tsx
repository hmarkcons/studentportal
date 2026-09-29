"use client";

import { useActionState, useState } from "react";
import { CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { signIn } from "@/app/login/actions";
import type { LoginScreenContent } from "@/lib/loginScreen";

type Audience = "student" | "staff";

/** A link that leaves the site opens beside it, so the sign-in stays where it was. */
function linkProps(url: string) {
  return url.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" };
}

/**
 * The sign-in: a Student tab that takes a Student ID or an email, and a
 * second tab — "Counsellor" by default — for everyone who signs in by email:
 * staff of every role, and partner universities. The tab changes what the
 * field asks for, not where it goes; the server reads an @ as an email and
 * anything else as a Student ID (actions.ts).
 *
 * `preview` is the Setup page's live copy: drawn exactly the same, submitting
 * nothing. `next` is where to go once signed in, read by the page from the
 * address — a scanned QR check-in link, a page the proxy turned away.
 */
export function LoginForm({ content, next = "", preview = false }: { content: LoginScreenContent; next?: string; preview?: boolean }) {
  const [state, formAction, pending] = useActionState(signIn, undefined);
  const [audience, setAudience] = useState<Audience>("student");
  const [showPassword, setShowPassword] = useState(false);
  const student = audience === "student";

  const input =
    "mt-2 h-[52px] w-full rounded-xl border border-[#d5dfda] bg-white px-4 text-[15.5px] text-[var(--login-heading)] outline-none transition placeholder:text-[#8a94a3] focus:border-[var(--login-accent)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--login-accent)_16%,transparent)]";

  return (
    <form action={preview ? undefined : formAction} className="mt-7" data-login-form>
      <input type="hidden" name="next" value={next} />

      <div role="tablist" aria-label="Who is signing in" className="grid grid-cols-2 gap-1 rounded-2xl bg-[#f1f4f3] p-1.5">
        {(["student", "staff"] as const).map((key) => {
          const selected = audience === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              data-full-width
              data-login-tab={key}
              onClick={() => setAudience(key)}
              className={`rounded-xl py-3 text-[15.5px] font-semibold transition-all duration-200 ${
                selected
                  ? "bg-white text-[var(--login-heading)] shadow-[0_1px_2px_rgb(16_24_40/0.06),0_4px_12px_-4px_rgb(16_24_40/0.12)]"
                  : "text-[#56627a] hover:text-[var(--login-heading)]"
              }`}
            >
              {key === "student" ? content.studentTab : content.staffTab}
            </button>
          );
        })}
      </div>

      <label htmlFor="login-identifier" className="mt-6 block text-[15px] font-semibold text-[var(--login-heading)]">
        {student ? "Student ID or email" : "Email"}
      </label>
      {/* Named "email" whatever it holds — password managers and the checks
          look for that — and a text field on the Student tab, because a
          Student ID is not an email address and the browser would refuse it. */}
      <input
        id="login-identifier"
        name="email"
        type={student ? "text" : "email"}
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        autoComplete={student ? "username" : "email"}
        placeholder={student ? "Your student ID or email" : "Your work email"}
        className={input}
      />

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <label htmlFor="login-password" className="text-[15px] font-semibold text-[var(--login-heading)]">
          Password
        </label>
        <a
          href={content.forgotUrl}
          {...linkProps(content.forgotUrl)}
          className="text-[14.5px] font-semibold text-[var(--login-accent)] hover:underline"
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
          className={`${input} pr-12`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          className="absolute right-2 top-1/2 mt-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#56627a] transition hover:bg-[#f1f4f3] hover:text-[var(--login-heading)]"
        >
          {showPassword ? <EyeOff aria-hidden className="h-5 w-5" /> : <Eye aria-hidden className="h-5 w-5" />}
        </button>
      </div>

      <label className="mt-5 flex w-fit cursor-pointer items-center gap-3 text-[15.5px] text-[#3d4b63]">
        <input
          type="checkbox"
          name="remember"
          className="h-5 w-5 cursor-pointer rounded border-[#b8c4bf] accent-[var(--login-accent)]"
          data-keep-signed-in
        />
        Keep me signed in
      </label>

      {state?.error && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-[#fef2f2] px-3.5 py-2.5 text-sm text-[#b42318]" data-login-error>
          <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <button
        type={preview ? "button" : "submit"}
        disabled={pending}
        aria-busy={pending || undefined}
        data-full-width
        className="relative mt-6 flex h-[54px] w-full items-center justify-center rounded-xl bg-[var(--login-accent)] text-[17px] font-bold text-white shadow-[0_14px_28px_-14px_var(--login-accent)] transition hover:-translate-y-px hover:bg-[color-mix(in_srgb,var(--login-accent)_88%,black)] disabled:cursor-wait disabled:opacity-80"
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

      <div className="mt-7 border-t border-[#e6ebe9] pt-6 text-center text-[15px] text-[#4a5568]">
        {content.signupPrompt}{" "}
        <a href={content.signupUrl} {...linkProps(content.signupUrl)} className="font-semibold text-[var(--login-accent)] hover:underline" data-signup-link>
          {content.signupLabel}
        </a>
      </div>
    </form>
  );
}
