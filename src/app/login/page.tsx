"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

function TravelIllustration() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full max-w-md" aria-hidden>
      <circle cx="200" cy="200" r="140" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="200" cy="200" r="100" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" />
      <path
        d="M70 230 Q 200 120 330 190"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.8"
        strokeWidth="2"
        strokeDasharray="6 8"
      />
      <g transform="translate(310,175) rotate(35)">
        <path d="M0 0 L18 6 L0 12 L4 6 Z" fill="#ffffff" />
      </g>
      <g transform="translate(120,270)">
        <rect x="0" y="10" width="46" height="34" rx="4" fill="#ffffff" fillOpacity="0.95" />
        <rect x="14" y="0" width="18" height="14" rx="3" fill="#ffffff" fillOpacity="0.95" />
      </g>
      <g transform="translate(220,250)">
        <rect x="0" y="0" width="40" height="56" rx="4" fill="#ffffff" fillOpacity="0.95" />
        <rect x="6" y="8" width="28" height="18" rx="2" fill="#52be96" />
        <path d="M11 30 L18 38 L29 22" fill="none" stroke="#52be96" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, undefined);

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 flex-col items-center justify-center gap-10 bg-primary p-10 lg:flex">
        <TravelIllustration />
        <div className="flex gap-4">
          <div className="rounded-lg bg-white/95 px-5 py-3 text-center shadow-lg">
            <p className="text-xl font-semibold text-ink">1,200+</p>
            <p className="text-xs text-muted">Students Placed</p>
          </div>
          <div className="rounded-lg bg-white/95 px-5 py-3 text-center shadow-lg">
            <p className="text-xl font-semibold text-ink">92%</p>
            <p className="text-xs text-muted">Visa Success Rate</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-bg px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-ink">HMARK Consultants</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your account.</p>

          <form action={formAction} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-ink">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            {state?.error && <p className="text-sm text-danger">{state.error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="mt-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Partner university? <a href="/register/partner" className="text-primary hover:underline">Register here</a>
          </p>
          <p className="mt-4 text-center text-xs text-muted">
            Need help? WhatsApp us at{" "}
            <a href="https://wa.me/923000000000" className="text-primary hover:underline">
              +92 300 0000000
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
