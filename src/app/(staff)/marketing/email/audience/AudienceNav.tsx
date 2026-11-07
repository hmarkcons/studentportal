import Link from "next/link";

const ITEMS = [
  { key: "overview", label: "Overview", href: "/marketing/email/audience" },
  { key: "segments", label: "Segments", href: "/marketing/email/audience/segments" },
  { key: "lists", label: "Lists", href: "/marketing/email/audience/lists" },
  { key: "import", label: "Import", href: "/marketing/email/audience/import" },
  { key: "suppressed", label: "Do-not-email list", href: "/marketing/email/audience/suppressed" },
] as const;

/** The Audience tab's own sections. */
export function AudienceNav({ active }: { active: (typeof ITEMS)[number]["key"] }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-1" aria-label="Audience">
      {ITEMS.map((i) => (
        <Link
          key={i.key}
          prefetch={false}
          href={i.href}
          className={`rounded-md px-3 py-1.5 text-xs ${i.key === active ? "bg-primary text-primary-ink" : "border border-border text-ink hover:bg-bg"}`}
          aria-current={i.key === active ? "page" : undefined}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
