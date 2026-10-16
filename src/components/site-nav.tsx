"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The two places a person needs: their deals and their own agent. The live
 * demo opens from a floating button instead; older views (results board,
 * dashboard, multi-party, /demo) still answer at their URLs.
 */
const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/agent", label: "Agent profile" },
];

export function SiteNav() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/room") : pathname.startsWith(href);

  return (
    <nav className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 text-sm">
        <Link href="/" className="mr-2 flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-6 items-center justify-center rounded-md bg-sky-600 text-[11px] font-bold text-white">
            AC
          </span>
          Agent Commons
        </Link>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-2 py-1 transition-colors",
              active(link.href)
                ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
