// The figures on the login screen, and the rules for editing them on
// Setup → Login screen (0278). Pure, so it is unit-tested
// (scripts/login-figures-test.mjs).

export const LOGIN_FIGURE_ICONS = ["years", "universities", "programs", "admissions", "visa", "star"] as const;
export type LoginFigureIcon = (typeof LOGIN_FIGURE_ICONS)[number];

export const LOGIN_FIGURE_ICON_LABELS: Record<LoginFigureIcon, string> = {
  years: "Calendar (years)",
  universities: "Building (universities)",
  programs: "Book (programmes)",
  admissions: "Graduation cap (admissions)",
  visa: "Passport (visas)",
  star: "Star (anything else)",
};

export type LoginFigure = { value: string; label: string; icon: LoginFigureIcon };

/** More than this and the row of tiles no longer fits beside the form. */
export const MAX_LOGIN_FIGURES = 6;
export const MAX_VALUE_LENGTH = 12;
export const MAX_LABEL_LENGTH = 40;

/**
 * What the login screen shows if the table cannot be read — the office's
 * figures of 2026-09-25, the same ones 0278 seeds. The login page is the one
 * page that must never fail, so it falls back to these rather than showing
 * nothing or an error.
 */
export const DEFAULT_LOGIN_FIGURES: LoginFigure[] = [
  { value: "15", label: "Years Experience", icon: "years" },
  { value: "1000+", label: "Universities", icon: "universities" },
  { value: "1000+", label: "Programs", icon: "programs" },
  { value: "7500+", label: "Admissions", icon: "admissions" },
  { value: "97%", label: "Visa Success", icon: "visa" },
];

export function isLoginFigureIcon(v: unknown): v is LoginFigureIcon {
  return typeof v === "string" && (LOGIN_FIGURE_ICONS as readonly string[]).includes(v);
}

/**
 * The figures a Setup form posted, in order, or what is wrong with them.
 *
 * Rows are posted as value_0, label_0, icon_0, value_1, … . A row left
 * completely empty is dropped — that is how one is removed — but a row with
 * only one of its two fields filled is an error, not a silent drop.
 */
export function parseLoginFigures(get: (name: string) => unknown): { figures: LoginFigure[] } | { error: string } {
  const figures: LoginFigure[] = [];
  for (let i = 0; i < MAX_LOGIN_FIGURES + 4; i++) {
    const value = String(get(`value_${i}`) ?? "").trim();
    const label = String(get(`label_${i}`) ?? "").trim();
    const icon = get(`icon_${i}`);
    if (!value && !label) continue;
    const n = figures.length + 1;
    if (!value) return { error: `Figure ${n} has a label but no number.` };
    if (!label) return { error: `Figure ${n} has a number but no label.` };
    if (value.length > MAX_VALUE_LENGTH) return { error: `Figure ${n}'s number is too long — keep it to ${MAX_VALUE_LENGTH} characters, like "7500+" or "97%".` };
    if (label.length > MAX_LABEL_LENGTH) return { error: `Figure ${n}'s label is too long — keep it to ${MAX_LABEL_LENGTH} characters.` };
    figures.push({ value, label, icon: isLoginFigureIcon(icon) ? icon : "star" });
  }
  if (figures.length === 0) return { error: "Keep at least one figure — the login screen would otherwise have none." };
  if (figures.length > MAX_LOGIN_FIGURES) return { error: `Up to ${MAX_LOGIN_FIGURES} figures fit on the login screen.` };
  return { figures };
}
