import Link from "next/link";

/**
 * Tabs as links — `?tab=staff` — so each tab is its own URL: shareable,
 * bookmarkable, and rendered on the server, which is what lets a tab someone
 * may not see be left out of the page entirely rather than hidden in it.
 */
export function SectionTabs({
  tabs,
  active,
}: {
  tabs: { key: string; label: string; href: string }[];
  active: string;
}) {
  if (tabs.length < 2) return null;
  return (
    <div role="tablist" className="mb-4 flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={t.key === active}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            t.key === active ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
