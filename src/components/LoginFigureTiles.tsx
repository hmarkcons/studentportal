import type { LoginFigure, LoginFigureIcon } from "@/lib/loginFigures";

// Simple line icons, drawn on a 24px grid in the current text colour.
const PATHS: Record<LoginFigureIcon, React.ReactNode> = {
  years: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="m9 14.5 2 2 4-4" />
    </>
  ),
  universities: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3.5 20h17" />
    </>
  ),
  programs: (
    <>
      <path d="M4 5.5A2 2 0 0 1 6 4h5v15H6a2 2 0 0 0-2 1.5z" />
      <path d="M20 5.5A2 2 0 0 0 18 4h-5v15h5a2 2 0 0 1 2 1.5z" />
    </>
  ),
  admissions: (
    <>
      <path d="M2.5 9 12 4.5 21.5 9 12 13.5z" />
      <path d="M6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11M21.5 9v5" />
    </>
  ),
  visa: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M9 16.5h6" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
};

export function LoginFigureIconSvg({ icon, className = "h-5 w-5" }: { icon: LoginFigureIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[icon] ?? PATHS.star}
    </svg>
  );
}

/**
 * The login screen's figures as tiles — "15 · Years Experience" and the rest.
 * `tone="brand"` is for the green panel, `tone="plain"` for a light page
 * (the Setup preview uses the panel's own colours, so it shows what the
 * login screen will).
 */
export function LoginFigureTiles({ figures, tone = "brand" }: { figures: LoginFigure[]; tone?: "brand" | "plain" }) {
  const tile =
    tone === "brand"
      ? "border-white/20 bg-white/10 text-white backdrop-blur-sm"
      : "border-border bg-card text-ink";
  const badge = tone === "brand" ? "bg-white text-[#1f6b52]" : "bg-primary/15 text-primary";
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="HMARK Consultants in numbers" data-login-figures>
      {figures.map((f, i) => (
        <li key={`${f.label}-${i}`} data-icon={f.icon} className={`flex flex-col items-start gap-2 rounded-xl border p-3 ${tile} ${i === figures.length - 1 && figures.length % 2 === 1 ? "col-span-2 sm:col-span-1" : ""}`}>
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${badge}`}>
            <LoginFigureIconSvg icon={f.icon} />
          </span>
          <span className="text-2xl font-bold leading-none tracking-tight">{f.value}</span>
          <span className={`text-xs font-medium leading-tight ${tone === "brand" ? "text-white/85" : "text-muted"}`}>{f.label}</span>
        </li>
      ))}
    </ul>
  );
}
