"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { signOut } from "@/lib/actions/auth";

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
  children,
}: {
  brand: string;
  nav: NavItem[];
  userName: string;
  userSubtitle: string;
  children: React.ReactNode;
}) {
  const activePath = usePathname();

  function isActive(href: string) {
    return activePath === href || activePath.startsWith(href + "/");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg">
        <div className="border-b border-sidebar-border px-5 py-5">
          <p className="text-lg font-semibold text-sidebar-ink">{brand}</p>
          <p className="text-xs text-sidebar-muted">HMARK Consultants</p>
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

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
          <input
            type="search"
            placeholder="Search…"
            className="w-64 rounded-md border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm hover:bg-bg"
              title="Notifications"
            >
              🔔
            </button>
            <div className="text-right">
              <p className="text-sm font-medium text-ink">{userName}</p>
              <p className="text-xs text-muted">{userSubtitle}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-sm text-ink hover:bg-bg"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 bg-bg px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
