"use client";

import { useEffect, useState } from "react";
import { TwoCompanies, ThreeFriends } from "@/components/live-demos";

/**
 * The live demo sits outside the product UI: a floating button opens a side
 * panel where agents negotiate for real. The pages themselves only show results.
 */
export function DemoLauncher() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 dark:bg-white dark:text-neutral-900"
      >
        <span className="text-emerald-400 dark:text-emerald-600">▶</span> Run live demo
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close demo"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="relative flex h-full w-full max-w-xl flex-col gap-5 overflow-y-auto bg-neutral-50 p-6 shadow-2xl dark:bg-neutral-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-emerald-600">
                  Live demo
                </div>
                <h2 className="text-xl font-semibold tracking-tight">Watch agents negotiate</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Pick a setup. The agents negotiate on their own, right now, with no person in
                  the loop.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>
            <TwoCompanies />
            <ThreeFriends />
          </aside>
        </div>
      )}
    </>
  );
}
