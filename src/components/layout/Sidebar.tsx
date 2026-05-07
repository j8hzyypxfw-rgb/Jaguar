"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderOpen, Database,
  ChevronRight, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects",  href: "/projects",  icon: FolderOpen },
  { label: "Database",  href: "/database",  icon: Database },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="flex flex-col w-56 shrink-0 border-r bg-card h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
          <Zap className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight leading-none">Jaguar</p>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Electrical Estimating</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {active && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t">
        <p className="text-[10px] text-muted-foreground">v0.1 · Jaguar</p>
      </div>
    </aside>
  );
}
