import { z } from "zod";

/**
 * The signed agent card (formerly "agent passport").
 *
 * A small, self-issued, self-signed JSON card an agent carries into a room.
 *
 * Design rules learned from review:
 *  1. No bare booleans. Every claim is either backed by an evidence object or
 *     explicitly marked `unverified` / `self_reported`. A receiving agent must
 *     be able to *check* a claim, not trust a flag.
 *  2. `owner_policy` describes what THIS agent's owner authorizes THIS agent to
 *     disclose. A counterparty's card is never authorization for us to share
 *     our own data.
 *  3. Expiry / revocation invalidate the *authority* claims (L1–L3). Key
 *     authentication (L0) is shown separately — the key still authenticates
 *     messages even after the card's authority claims lapse.
 *
 * Shape follows A2A Signed Agent Cards (Apache-2.0) and AgentFacts KYA
 * metadata; we take a small subset.
 */

export const ClaimStatusSchema = z.enum(["unverified", "self_reported", "evidence"]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

export const EvidenceSchema = z.object({
  /** Kind of evidence, e.g. "signature" | "domain-challenge" | "probe-result" | "list-check". */
  type: z.string(),
  method: z.string(),
  /**
   * Who produced it. A label is NOT a trust anchor — `issuer` carries the
   * producer's public key, so a receiver checks a signature against a key
   * rather than trusting a name. Values:
   *  - "self"      the agent itself (authorship only, not independent execution)
   *  - "owner"     the human owner, signing with their own key
   *  - "third-party" an external party with its own key
   */
  produced_by: z.enum(["self", "owner", "third-party"]),
  /** Public key of the producer (base64url). Null when no key attests it. */
  issuer: z.string().nullable(),
  issued_at: z.string(),
  payload: z.record(z.string(), z.unknown()),
  /** Signature over the evidence payload, base64url. */
  evidence_sig: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ClaimSchema = z.object({
  status: ClaimStatusSchema,
  evidence: EvidenceSchema.nullable(),
  note: z.string().optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const AgentCardSchema = z.object({
  type: z.literal("agent_card"),
  v: z.literal(1),
  /** Ed25519 public key, base64url — also the agent id. */
  agent_id: z.string(),
  display_name: z.string(),
  owner: z.object({
    name: z.string(),
    /** Contact used for the owner-binding challenge; not an identity proof. */
    contact: z.string().nullable(),
  }),
  purpose: z.array(z.string()),
  capabilities: z.array(z.string()),
  /** THIS agent's own owner-authorized disclosure policy. */
  owner_policy: z.object({
    may_disclose: z.array(z.string()),
    must_not_disclose: z.array(z.string()),
  }),
  claims: z.object({
    /** L0 — the card signature itself proves the sender controls this key. */
    key_control: ClaimSchema,
    /** L1 — owner binding. Proves control of a contact, NOT authority to represent a company. */
    owner_binding: ClaimSchema,
    /** L2 — capability self-test. Self-produced evidence of function. */
    capability_probe: ClaimSchema,
    /** L3 — external screening. A local/synthetic check, not an independent authority. */
    screening: ClaimSchema,
  }),
  expires_at: z.string().nullable(),
  revocation: z.object({
    revoked: z.boolean(),
    reason: z.string().nullable(),
    at: z.string().nullable(),
  }),
  sig: z.string(),
});

export type AgentCard = z.infer<typeof AgentCardSchema>;

export type VerificationLevel = "L0" | "L1" | "L2" | "L3";

export const LEVEL_DESCRIPTION: Record<VerificationLevel, string> = {
  L0: "Key control — the card signature verifies. Proves this key, nothing more.",
  L1: "Owner binding — the owner's own key signs a challenge bound to this agent key. Proves control of that key; not a legal identity, not authority to represent an organisation.",
  L2: "Capability probe — self-reported. The signature proves authorship of the result, not independent execution.",
  L3: "External screening — self-reported in this demo; no independent authority is involved.",
};

export interface CardAssessment {
  /** Highest level whose claim carries evidence. */
  level: VerificationLevel;
  /** Key authentication is independent of authority claims. */
  keyAuthenticated: boolean;
  /** Claims whose authority has lapsed (expired / revoked). */
  lapsed: boolean;
  /** Human-readable per-claim status for the UI. */
  claims: Array<{
    key: "key_control" | "owner_binding" | "capability_probe" | "screening";
    level: VerificationLevel;
    status: ClaimStatus;
    label: string;
  }>;
}

export function isExpired(card: AgentCard, now: Date = new Date()): boolean {
  if (!card.expires_at) return false;
  return new Date(card.expires_at).getTime() < now.getTime();
}

/** The bytes that get signed: the card without its `sig` field. */
export function cardSigningPayload(card: AgentCard): Omit<AgentCard, "sig"> {
  const { sig: _sig, ...rest } = card;
  return rest;
}

/**
 * Assess a card honestly.
 *
 * `keyAuthenticated` must be computed by the caller from the card signature
 * (see `verifyValue` in keys.ts). Expiry/revocation clear the *authority*
 * claims but never the key authentication.
 */
export function assessCard(
  card: AgentCard,
  keyAuthenticated: boolean,
  now: Date = new Date(),
): CardAssessment {
  const lapsed = isExpired(card, now) || card.revocation.revoked;
  const has = (c: Claim) => !lapsed && c.status === "evidence";

  const level: VerificationLevel = has(card.claims.screening)
    ? "L3"
    : has(card.claims.capability_probe)
      ? "L2"
      : has(card.claims.owner_binding)
        ? "L1"
        : "L0";

  const label = (c: Claim): string => {
    if (lapsed && c.status !== "unverified") return "lapsed (expired/revoked)";
    switch (c.status) {
      case "evidence":
        return `evidence (${c.evidence?.type ?? "unknown"})`;
      case "self_reported":
        return "self-reported";
      default:
        return "unverified";
    }
  };

  return {
    level,
    keyAuthenticated,
    lapsed,
    claims: [
      {
        key: "key_control",
        level: "L0",
        status: keyAuthenticated ? "evidence" : "unverified",
        label: keyAuthenticated ? "key authenticated" : "key NOT authenticated",
      },
      {
        key: "owner_binding",
        level: "L1",
        status: lapsed ? "unverified" : card.claims.owner_binding.status,
        label: label(card.claims.owner_binding),
      },
      {
        key: "capability_probe",
        level: "L2",
        status: lapsed ? "unverified" : card.claims.capability_probe.status,
        label: label(card.claims.capability_probe),
      },
      {
        key: "screening",
        level: "L3",
        status: lapsed ? "unverified" : card.claims.screening.status,
        label: label(card.claims.screening),
      },
    ],
  };
}
