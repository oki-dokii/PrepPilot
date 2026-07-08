"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  
  const nav = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/library", label: "Library" },
    { to: "/settings", label: "Settings" },
  ];

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email ? user.email.slice(0, 2).toUpperCase() : "U");

  return (
    <div className="min-h-screen bg-background text-foreground bg-grid flex flex-col">
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto max-w-[1240px] px-6 h-14 flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <LogoMark />
            <span className="font-display text-[15px] font-medium tracking-tight">PrepPilot</span>
          </Link>
          <nav className="flex items-center gap-1 text-[13px]">
            {nav.map((n) => {
              const active = pathname === n.to || (n.to !== "/" && pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  href={n.to}
                  className={
                    "px-3 py-1.5 rounded-sm transition-colors " +
                    (active
                      ? "bg-blueprint/10 text-blueprint font-medium"
                      : "text-foreground/70 hover:text-foreground hover:bg-foreground/5")
                  }
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 stamp-id">
              <span>ACTIVE · PREP</span>
              <span className="text-foreground">LIVE</span>
            </div>
            {user && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-foreground text-background grid place-items-center font-mono text-[11px] shrink-0">
                  {initials}
                </div>
                <ThemeToggle />
                <button
                  onClick={logout}
                  className="stamp-id hover:text-rust transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      
      <main className="mx-auto max-w-[1240px] px-6 py-10 flex-1 w-full">{children}</main>
      
      <footer className="border-t border-border mt-16 bg-background/40">
        <div className="mx-auto max-w-[1240px] px-6 h-14 flex items-center justify-between stamp-id">
          <span>PREPPILOT · BLUEPRINT EDITION</span>
          <span>SHEET 01 / 01</span>
        </div>
      </footer>
    </div>
  );
}

export function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="text-blueprint" aria-hidden>
      <rect x="1" y="1" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="6" cy="6" r="1.6" fill="currentColor" />
      <circle cx="16" cy="6" r="1.6" fill="currentColor" />
      <circle cx="11" cy="16" r="1.6" fill="currentColor" />
      <path d="M6 6 L11 16 L16 6" fill="none" stroke="currentColor" strokeWidth="0.9" />
    </svg>
  );
}

export function StampCard({
  id,
  title,
  children,
  className = "",
}: {
  id?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"stamp-card p-6 " + className}>
      {(id || title) && (
        <div className="flex items-baseline justify-between mb-4">
          {title && <div className="font-display text-[15px]">{title}</div>}
          {id && <div className="stamp-id">{id}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
