"use client";

import React, { type ReactNode } from "react";

/** Tiny class joiner — the project has no `cn`/clsx util. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

interface AuroraBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Fade the aurora toward the corner with a radial mask (on by default). */
  showRadialGradient?: boolean;
}

/**
 * Aurora Background — an animated, layered aurora gradient behind its children.
 *
 * Faithful port of the Aceternity "Aurora Background" (Manu Arora), including
 * its two-layer structure: a static blurred/inverted base plus an animated
 * `::after` blended with mix-blend-difference. Adapted for this project —
 * Tailwind v4 (no tailwind.config keyframes or color CSS vars), no `cn` util,
 * and the gradients + keyframes kept self-contained in one <style> so it drops
 * in without touching globals.css. The gradient colours are the exact Tailwind
 * values the original references (blue-500 / indigo-300 / blue-300 / violet-200
 * / blue-400). Light/dark follow the portal's `data-theme` convention.
 */
export function AuroraBackground({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) {
  return (
    <div
      className={cx(
        "aurora-bg relative flex min-h-screen flex-col items-center justify-center",
        className,
      )}
      {...props}
    >
      <style>{AURORA_CSS}</style>
      <div className="absolute inset-0 overflow-hidden">
        <div aria-hidden className={cx("aurora-fx", showRadialGradient && "aurora-fx--masked")} />
      </div>
      {children}
    </div>
  );
}

export default AuroraBackground;

const AURORA_CSS = `
.aurora-bg { background: #fafafa; color: #020617; transition: background-color .2s ease; }
:root[data-theme="dark"] .aurora-bg,
:root[data-theme="semi-dark"] .aurora-bg { background: #18181b; color: #f8fafc; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .aurora-bg { background: #18181b; color: #f8fafc; }
}

@keyframes aurora-pan {
  from { background-position: 50% 50%, 50% 50%; }
  to   { background-position: 350% 50%, 350% 50%; }
}

/* Base (static, blurred, inverted) layer. */
.aurora-fx {
  pointer-events: none;
  position: absolute;
  inset: -10px;
  opacity: 0.5;
  will-change: transform;
  --white-gradient: repeating-linear-gradient(100deg, #fff 0%, #fff 7%, transparent 10%, transparent 12%, #fff 16%);
  --dark-gradient: repeating-linear-gradient(100deg, #000 0%, #000 7%, transparent 10%, transparent 12%, #000 16%);
  --aurora: repeating-linear-gradient(100deg, #3b82f6 10%, #a5b4fc 15%, #93c5fd 20%, #ddd6fe 25%, #60a5fa 30%);
  background-image: var(--white-gradient), var(--aurora);
  background-size: 300%, 200%;
  background-position: 50% 50%, 50% 50%;
  filter: blur(10px) invert(1);
}
/* Animated overlay, blended against the base. */
.aurora-fx::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: var(--white-gradient), var(--aurora);
  background-size: 200%, 100%;
  background-attachment: fixed;
  mix-blend-mode: difference;
  animation: aurora-pan 60s linear infinite;
}

:root[data-theme="dark"] .aurora-fx,
:root[data-theme="semi-dark"] .aurora-fx { filter: blur(10px); background-image: var(--dark-gradient), var(--aurora); }
:root[data-theme="dark"] .aurora-fx::after,
:root[data-theme="semi-dark"] .aurora-fx::after { background-image: var(--dark-gradient), var(--aurora); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .aurora-fx { filter: blur(10px); background-image: var(--dark-gradient), var(--aurora); }
  :root:not([data-theme="light"]) .aurora-fx::after { background-image: var(--dark-gradient), var(--aurora); }
}

.aurora-fx--masked {
  -webkit-mask-image: radial-gradient(ellipse at 100% 0%, #000 10%, transparent 70%);
          mask-image: radial-gradient(ellipse at 100% 0%, #000 10%, transparent 70%);
}
@media (prefers-reduced-motion: reduce) { .aurora-fx::after { animation: none; } }
`;
