"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { SignOutButton } from "./SignOutButton";
import { SidebarToggle } from "./SidebarToggle";
import { ChevronRight, Menu, X } from "lucide-react";
import { NAV_ACCENT_TEXT, NavIcon, navAccent } from "./NavIcon";

// Pulls in React Query's client runtime — only staff nav uses search, so
// student/partner portals never ship this code.
const GlobalSearch = dynamic(() => import("./GlobalSearch").then((m) => m.GlobalSearch), {
  ssr: false,
  loading: () => <div className="h-8 w-64 animate-pulse rounded-md bg-border/40" />,
});

export type NavItem = {
  label: string;
  href?: string;
  /** A name from NavIcon's set — the menus are data, so they name their icon. */
  icon?: string;
  children?: { label: string; href: string }[];
  /** Unread count shown beside the label. Omitted or 0 renders nothing. */
  badge?: number;
};

/**
 * The student portal's look, applied here and in globals.css under
 * data-portal="student": the page in its own finish, the menu's current entry
 * in the brand gradient, each icon on a tile of its own, and the student's
 * initials beside their name. Staff and partner keep the plain shell.
 */
export type ShellVariant = "default" | "student";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export function AppShell({
  brand,
  nav,
  userName,
  userSubtitle,
  showSearch = false,
  variant = "default",
  sidebarFooter,
  children,
}: {
  brand: string;
  nav: NavItem[];
  userName: string;
  userSubtitle: string;
  showSearch?: boolean;
  variant?: ShellVariant;
  /** Under the menu, at the foot of the sidebar. */
  sidebarFooter?: React.ReactNode;
  children: React.ReactNode;
}) {
  const student = variant === "student";
  const activePath = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  // The sidebar is a fixed off-canvas drawer only below the md breakpoint
  // (md:sticky below overrides all of this back to the always-visible
  // layout) — closing it whenever the route changes means a nav
  // click never leaves it stuck open over the new page. Adjusted during
  // render (React's documented pattern for "reset state when a prop/value
  // changes") rather than in a useEffect, which would cascade an extra render.
  const [prevActivePath, setPrevActivePath] = useState(activePath);
  if (activePath !== prevActivePath) {
    setPrevActivePath(activePath);
    setNavOpen(false);
  }

  // The one entry for the page you are on: the longest link the address sits
  // under. Matching every prefix lit two at once wherever one link is the
  // parent of another — the student's Dashboard is /portal, so it stayed
  // highlighted beside Documents, Payments and every other page.
  const activeHref =
    nav
      .flatMap((item) => (item.children ? item.children.map((c) => c.href) : item.href ? [item.href] : []))
      .filter((href) => activePath === href || activePath.startsWith(href + "/"))
      .sort((a, b) => b.length - a.length)[0] ?? null;

  function isActive(href: string) {
    return href === activeHref;
  }
  const iconColour = (icon: string | undefined, fallback: string) => {
    const n = navAccent(icon);
    return n ? NAV_ACCENT_TEXT[n] : fallback;
  };
  // The section the current page belongs to, whose colour its header takes.
  const pageAccent =
    navAccent(nav.find((item) => (item.href && isActive(item.href)) || item.children?.some((c) => isActive(c.href)))?.icon) ?? undefined;

  // The menu scrolls on its own, so the page you are on can be below its fold
  // — Setup's pages are the last dozen links. Brought into view in the menu
  // alone, never by scrolling the page.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const box = nav.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    if (item.top < box.top) nav.scrollTop -= box.top - item.top + 12;
    else if (item.bottom > box.bottom) nav.scrollTop += item.bottom - box.bottom + 12;
  }, [activePath]);

  return (
    <div className="flex min-h-screen" data-shell data-portal={student ? "student" : undefined}>
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        data-app-sidebar
        // md:sticky + h-dvh: the sidebar holds its place at the height of the
        // screen while the page scrolls, and its menu scrolls on its own
        // scrollbar. It used to be as tall as the page, so reaching the lower
        // links meant scrolling the whole page down.
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg transition-transform duration-200 ease-in-out md:sticky md:top-0 md:z-auto md:h-dvh md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-5">
          <div>
            {/* No box behind it: the logo is transparent, and lettered light
                where the sidebar is dark (BrandLogo). h-11: the asset is
                1667x617, so this comes out ~119px wide in a 216px-wide header
                — room for the Hide control beside it. */}
            <BrandLogo surface="sidebar" imgClassName="h-11 w-auto" />
            <p className="mt-2 text-xs font-medium text-sidebar-ink">{brand}</p>
          </div>
          <div className="flex items-center gap-1">
            <SidebarToggle variant="hide" />
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close menu"
              className="rounded-md p-1 text-sidebar-ink hover:bg-sidebar-active-bg md:hidden"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* prefetch={false} on every link in here, deliberately.
 *
 * A <Link> prefetches as soon as it enters the viewport, and this sidebar
 * puts every section a staff member can reach on screen at once. Each
 * prefetch is a real server render behind the proxy's auth check, so one
 * page view fired a dozen of them: measured on the staff directory, they
 * added about two and a half seconds after the page had already finished
 * and loaded work onto the server nobody had asked for.
 *
 * Nothing is lost by turning it off. loading.tsx covers (staff) and the
 * student pages, so a click paints a skeleton immediately either way —
 * which is the feedback prefetching was buying, at the cost of rendering
 * twenty pages the person was never going to open. */}
        <nav ref={navRef} data-sidebar-nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
          {nav.map((item) =>
            item.children ? (
              <details
                key={item.label}
                open={item.children.some((c) => isActive(c.href))}
                className="group mb-1"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-sidebar-ink transition-colors hover:bg-[color-mix(in_srgb,var(--sidebar-ink)_5%,transparent)]">
                  <span className="flex items-center gap-2.5">
                    {item.icon && <NavIcon name={item.icon} className={`h-[18px] w-[18px] ${iconColour(item.icon, "text-sidebar-muted")}`} />}
                    {item.label}
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 text-sidebar-muted transition-transform group-open:rotate-90" />
                </summary>
                <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      prefetch={false}
                      aria-current={isActive(child.href) ? "page" : undefined}
                      className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        isActive(child.href)
                          ? "bg-sidebar-active-bg font-semibold text-[var(--nav-active-ink)]"
                          : "text-sidebar-muted hover:bg-[color-mix(in_srgb,var(--sidebar-ink)_5%,transparent)] hover:text-sidebar-ink"
                      }`}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              </details>
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                prefetch={false}
                aria-current={isActive(item.href!) ? "page" : undefined}
                className={
                  // The page you are on: a tint and a slim bar, the one green in the menu — in every portal.
                  `group relative mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                    isActive(item.href!)
                      ? "bg-sidebar-active-bg font-semibold text-[var(--nav-active-ink)] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-[var(--nav-active-ink)]"
                      : "font-medium text-sidebar-ink hover:bg-[color-mix(in_srgb,var(--sidebar-ink)_5%,transparent)]"
                  }`
                }
              >
                {item.icon && (
                  <NavIcon
                    name={item.icon}
                    className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                      isActive(item.href!) ? "text-[var(--nav-active-ink)]" : iconColour(item.icon, "text-sidebar-muted group-hover:text-sidebar-ink")
                    }`}
                  />
                )}
                {item.label}
                {Boolean(item.badge) && (
                  <span
                    className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                      "bg-danger text-white"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          )}
        </nav>
        {sidebarFooter && <div className="shrink-0 border-t border-sidebar-border p-3">{sidebarFooter}</div>}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-app-header
          className={`flex items-center justify-between border-b border-border px-6 py-3 ${
            student ? "sticky top-0 z-20 bg-card/85 backdrop-blur-md" : "bg-card"
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              className="rounded-md p-1.5 text-ink hover:bg-bg md:hidden"
            >
              <Menu aria-hidden className="h-5 w-5" />
            </button>
            {/* Its desktop twin, which CSS keeps out of sight until the menu
                is actually away. */}
            <SidebarToggle variant="show" />
            {showSearch && <GlobalSearch />}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="flex items-center gap-2.5">
              <div className="text-right">
                <p className="text-sm font-medium text-ink">{userName}</p>
                {/* On a phone the student's ID line would push Sign out onto two lines; the dashboard shows it. */}
                <p className="hidden text-xs text-muted sm:block">{userSubtitle}</p>
              </div>
              <span
                aria-hidden
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand-strong)] sm:flex"
              >
                {initialsOf(userName)}
              </span>
            </div>
            <SignOutButton variant="outline">Sign out</SignOutButton>
          </div>
        </header>
        <main className="flex-1 bg-bg px-6 py-8" data-page-accent={pageAccent}>
          {children}
        </main>
      </div>
    </div>
  );
}
