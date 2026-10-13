/** "Ayesha Khan" → "AK". */
export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

/** The top bar's circle beside the person's name, when there is no photo to show (or until it arrives). */
export const HEADER_AVATAR_CLASS = "h-12 w-12 shrink-0 rounded-full";

export function AvatarInitials({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      data-header-avatar="initials"
      className={`flex items-center justify-center bg-[var(--brand-soft)] text-sm font-semibold text-[var(--brand-strong)] ${HEADER_AVATAR_CLASS}`}
    >
      {initialsOf(name)}
    </span>
  );
}
