import { Building2, KeyRound, ShieldCheck, Zap, type LucideIcon } from "lucide-react";
import {
  TRUST_LABEL,
  TRUST_MEANING,
  trustSummary,
  type BadgeState,
  type TrustBadge,
  type TrustKey,
} from "@/lib/trust-badges";
import { cn } from "@/lib/utils";

const ICON: Record<TrustKey, LucideIcon> = {
  key_control: KeyRound,
  owner_binding: Building2,
  capability_probe: Zap,
  screening: ShieldCheck,
};

const STATE_STYLE: Record<BadgeState, string> = {
  verified:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  claimed:
    "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400",
  missing:
    "border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-700 dark:text-neutral-600",
  failed: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

const STATE_WORD: Record<BadgeState, string> = {
  verified: "verified",
  claimed: "claimed, not verified",
  missing: "not claimed",
  failed: "failed or expired",
};

/** The four trust checks as icons; `compact` drops the labels for tight rows. */
export function TrustBadges({ badges, compact }: { badges: TrustBadge[]; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badges.map((b) => {
        const Icon = ICON[b.key];
        return (
          <span
            key={b.key}
            title={`${TRUST_LABEL[b.key]} — ${STATE_WORD[b.state]}. ${TRUST_MEANING[b.key]}.`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border text-xs font-medium",
              compact ? "size-6 justify-center" : "px-2 py-0.5",
              STATE_STYLE[b.state],
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {compact ? <span className="sr-only">{TRUST_LABEL[b.key]}</span> : TRUST_LABEL[b.key]}
          </span>
        );
      })}
    </div>
  );
}

export function TrustSummary({ badges }: { badges: TrustBadge[] }) {
  const s = trustSummary(badges);
  return (
    <span
      className={cn(
        "text-xs font-medium",
        s.tone === "good" && "text-emerald-700 dark:text-emerald-400",
        s.tone === "partial" && "text-neutral-500",
        s.tone === "bad" && "text-rose-700 dark:text-rose-400",
      )}
    >
      {s.label}
    </span>
  );
}

/** A legend for the four checks and their states. */
export function TrustLegend() {
  return (
    <div className="flex flex-col gap-2 text-xs text-neutral-600 dark:text-neutral-400">
      {(Object.keys(TRUST_LABEL) as TrustKey[]).map((k) => {
        const Icon = ICON[k];
        return (
          <div key={k} className="flex items-center gap-2">
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="font-medium text-neutral-800 dark:text-neutral-200">{TRUST_LABEL[k]}</span>
            <span>— {TRUST_MEANING[k]}</span>
          </div>
        );
      })}
      <div className="mt-1 flex flex-wrap gap-3">
        <span><span className="text-emerald-600">●</span> verified</span>
        <span><span className="text-neutral-400">○</span> only claimed</span>
        <span><span className="text-rose-600">●</span> failed or expired</span>
      </div>
    </div>
  );
}
