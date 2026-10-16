import { ShieldAlert } from "lucide-react";

/** A deal-level caution: the counterparty's agent failed a trust check. */
export function TrustWarning({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 border-t border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <span className="font-semibold">Check before you confirm.</span> {message} The terms are
        signed, but you can&apos;t be sure who stands behind them.
      </div>
    </div>
  );
}
