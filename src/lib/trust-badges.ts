/**
 * Trust badges — an agent card's four checks as a person reads them.
 *
 * Pure and dependency-free so both the server (seeded cards) and the browser
 * (cards built from /api/agent-card) can use it. Each check is one of:
 * verified (backed by evidence), claimed (self-reported), missing (not even
 * claimed), or failed (lapsed, or contradicted by its own evidence).
 */

export type TrustKey = "key_control" | "owner_binding" | "capability_probe" | "screening";
export type BadgeState = "verified" | "claimed" | "missing" | "failed";

export interface TrustBadge {
  key: TrustKey;
  state: BadgeState;
}

/** The subset of a card assessment the badges need. */
export interface AssessmentLike {
  lapsed: boolean;
  claims: { key: string; status: string }[];
}

export const TRUST_LABEL: Record<TrustKey, string> = {
  key_control: "Signed",
  owner_binding: "Real owner",
  capability_probe: "Tested skills",
  screening: "Background check",
};

export const TRUST_MEANING: Record<TrustKey, string> = {
  key_control: "Its messages are signed with its own key, so nobody can fake them",
  owner_binding: "The company has proved this agent belongs to it",
  capability_probe: "It was tested to really do what it says it can",
  screening: "The company was screened against a fraud list",
};

const ORDER: TrustKey[] = ["key_control", "owner_binding", "capability_probe", "screening"];

export function trustBadges(assessment: AssessmentLike, opts: { flagged?: boolean } = {}): TrustBadge[] {
  return ORDER.map((key) => {
    const claim = assessment.claims.find((c) => c.key === key);
    const status = claim?.status ?? "unverified";
    if (key === "key_control") {
      return { key, state: status === "evidence" ? "verified" : "failed" };
    }
    if (assessment.lapsed) return { key, state: "failed" };
    if (key === "screening" && opts.flagged) return { key, state: "failed" };
    if (status === "evidence") return { key, state: "verified" };
    if (status === "self_reported") return { key, state: "claimed" };
    return { key, state: "missing" };
  });
}

/** One word for the whole card: can I trust this agent? */
export function trustSummary(badges: TrustBadge[]): { tone: "good" | "partial" | "bad"; label: string } {
  if (badges.some((b) => b.state === "failed")) return { tone: "bad", label: "Don't trust" };
  const verified = badges.filter((b) => b.state === "verified").length;
  if (verified === badges.length) return { tone: "good", label: "Fully verified" };
  return { tone: "partial", label: `${verified} of ${badges.length} verified` };
}
