"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { SignOutButton } from "./SignOutButton";

// Pulls in React Query's client runtime — only staff nav uses search, so
// student/partner portals never ship this code.
const GlobalSearch = dynamic(() => import("./GlobalSearch").then((m) => m.GlobalSearch), {
  ssr: false,
  loading: () => <div className="h-8 w-64 animate-pulse rounded-md bg-border/40" />,
});

export type NavItem = {
  label: string;
  href?: string;
  icon?: string;
  children?: { label: string; href: string }[];
};

export function AppShell({
  brand,
  nav,
  userName,
  userSubtitle,
  showSearch = false,
  children,
}: {
  brand: string;
  nav: NavItem[];
  userName: string;
  userSubtitle: string;
  showSearch?: boolean;
  children: React.ReactNode;
}) {
  const activePath = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  // The sidebar is a fixed off-canvas drawer only below the md breakpoint
  // (md:static below overrides all of this back to the original always-
  // visible layout) — closing it whenever the route changes means a nav
  // click never leaves it stuck open over the new page. Adjusted during
  // render (React's documented pattern for "reset state when a prop/value
  // changes") rather than in a useEffect, which would cascade an extra render.
  const [prevActivePath, setPrevActivePath] = useState(activePath);
  if (activePath !== prevActivePath) {
    setPrevActivePath(activePath);
    setNavOpen(false);
  }

  function isActive(href: string) {
    return activePath === href || activePath.startsWith(href + "/");
  }

  return (
    <div className="flex min-h-screen">
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg transition-transform duration-200 ease-in-out md:static md:z-auto md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-5">
          <div>
            <div className="inline-block rounded-md bg-white px-2 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, not worth next/image's overhead in a fixed-size sidebar header */}
              <img src="/hmark-logo.png" alt="HMARK Consultants" className="h-6 w-auto" />
            </div>
            <p className="mt-2 text-xs font-medium text-sidebar-ink">{brand}</p>
          </div>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
            className="rounded-md p-1 text-sidebar-ink hover:bg-sidebar-active-bg md:hidden"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {nav.map((item) =>
            item.children ? (
              <details
                key={item.label}
                open={item.children.some((c) => isActive(c.href))}
                className="group mb-1"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-sidebar-ink hover:bg-sidebar-active-bg">
                  <span className="flex items-center gap-2">
                    {item.icon && <span>{item.icon}</span>}
                    {item.label}
                  </span>
                  <span className="text-xs text-sidebar-muted transition-transform group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`rounded-md px-3 py-1.5 text-sm ${
                        isActive(child.href)
                          ? "bg-sidebar-active-bg font-medium text-primary"
                          : "text-sidebar-muted hover:text-sidebar-ink"
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
                className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive(item.href!)
                    ? "bg-sidebar-active-bg text-primary"
                    : "text-sidebar-ink hover:bg-sidebar-active-bg"
                }`}
              >
                {item.icon && <span>{item.icon}</span>}
                {item.label}
              </Link>
            )
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              className="rounded-md p-1.5 text-ink hover:bg-bg md:hidden"
            >
              ☰
            </button>
            {showSearch && <GlobalSearch />}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="text-right">
              <p className="text-sm font-medium text-ink">{userName}</p>
              <p className="text-xs text-muted">{userSubtitle}</p>
            </div>
            <SignOutButton variant="outline">Sign out</SignOutButton>
          </div>
        </header>
        <main className="flex-1 bg-bg px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
