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
 * A faithful port of the well-known Aceternity "Aurora Background" (Manu Arora),
 * adapted for this project: Tailwind v4 (no tailwind.config keyframes), no `cn`
 * util, and the gradients + keyframes kept self-contained in one <style> so it
 * drops in without touching globals.css. Light/dark follow the portal's own
 * `data-theme` convention, with the system preference as a fallback.
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
        "aurora-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden",
        className,
      )}
      {...props}
    >
      <style>{AURORA_CSS}</style>
      <div aria-hidden className={cx("aurora-fx", showRadialGradient && "aurora-fx--masked")} />
      {children}
    </div>
  );
}

export default AuroraBackground;

const AURORA_CSS = `
.aurora-bg { background: #fafafa; color: #0a0a0a; transition: background-color .2s ease; }
:root[data-theme="dark"] .aurora-bg,
:root[data-theme="semi-dark"] .aurora-bg { background: #18181b; color: #fafafa; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .aurora-bg { background: #18181b; color: #fafafa; }
}

@keyframes aurora-pan {
  from { background-position: 50% 50%, 50% 50%; }
  to   { background-position: 350% 50%, 350% 50%; }
}

.aurora-fx { pointer-events: none; position: absolute; inset: 0; overflow: hidden; }
.aurora-fx::after {
  content: "";
  position: absolute;
  inset: -10px;
  background-image:
    repeating-linear-gradient(100deg, #fff 0%, #fff 7%, transparent 10%, transparent 12%, #fff 16%),
    repeating-linear-gradient(100deg, #3b82f6 10%, #a5b4fc 15%, #93c5fd 20%, #ddd6fe 25%, #60a5fa 30%);
  background-size: 300%, 200%;
  background-position: 50% 50%, 50% 50%;
  filter: blur(10px) invert(1);
  mix-blend-mode: difference;
  opacity: 0.55;
  will-change: background-position;
  animation: aurora-pan 60s linear infinite;
}
:root[data-theme="dark"] .aurora-fx::after,
:root[data-theme="semi-dark"] .aurora-fx::after {
  background-image:
    repeating-linear-gradient(100deg, #000 0%, #000 7%, transparent 10%, transparent 12%, #000 16%),
    repeating-linear-gradient(100deg, #3b82f6 10%, #a5b4fc 15%, #93c5fd 20%, #ddd6fe 25%, #60a5fa 30%);
  filter: blur(10px);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .aurora-fx::after {
    background-image:
      repeating-linear-gradient(100deg, #000 0%, #000 7%, transparent 10%, transparent 12%, #000 16%),
      repeating-linear-gradient(100deg, #3b82f6 10%, #a5b4fc 15%, #93c5fd 20%, #ddd6fe 25%, #60a5fa 30%);
    filter: blur(10px);
  }
}
.aurora-fx--masked::after {
  -webkit-mask-image: radial-gradient(ellipse at 100% 0%, #000 10%, transparent 70%);
          mask-image: radial-gradient(ellipse at 100% 0%, #000 10%, transparent 70%);
}
@media (prefers-reduced-motion: reduce) { .aurora-fx::after { animation: none; } }
`;
