import Link from "next/link";

/**
 * Tabs as links — `?tab=staff` — so each tab is its own URL: shareable,
 * bookmarkable, and rendered on the server, which is what lets a tab someone
 * may not see be left out of the page entirely rather than hidden in it.
 *
 * Not prefetched: a tab is a whole server render, and a visible <Link>
 * prefetches as soon as it is on screen — so a strip of six dashboard tabs
 * computed six dashboards on every visit. Wraps rather than scrolls, and the
 * underline colour is set inline, for the reasons in students/[id]/StudentTabs.
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
    <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          prefetch={false}
          aria-selected={t.key === active}
          style={{ borderBottomColor: t.key === active ? "var(--primary)" : "transparent" }}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${t.key === active ? "text-primary" : "text-muted hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
