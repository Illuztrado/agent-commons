import { z } from "zod";

/**
 * The signed agent card (formerly "agent passport").
 *
 * A small, self-issued, self-signed JSON card an agent carries into a room:
 * who its owner is, what it may do, what it may share, and which claims have
 * been checked. Nothing here claims a real-world legal identity.
 *
 * Format follows the shape of A2A Signed Agent Cards (Apache-2.0) and
 * AgentFacts KYA metadata; we take a small subset.
 */

export const ScreeningSchema = z.enum(["clear", "flagged", "unknown"]);
export type Screening = z.infer<typeof ScreeningSchema>;

export const AgentCardSchema = z.object({
  type: z.literal("agent_card"),
  v: z.literal(1),
  /** Ed25519 public key, base64url — also the agent id. */
  agent_id: z.string(),
  display_name: z.string(),
  owner: z.object({
    name: z.string(),
    /** How owner control was demonstrated, e.g. "email-domain-verified" | "self-declared". */
    binding: z.string(),
  }),
  purpose: z.array(z.string()),
  capabilities: z.array(z.string()),
  /** Fields the agent is authorized to disclose / negotiate over. */
  sharing_scope: z.array(z.string()),
  verification: z.object({
    self_signed: z.boolean(),
    owner_binding: z.boolean(),
    capability_probe: z.boolean(),
    screening: ScreeningSchema,
  }),
  expires_at: z.string().nullable(),
  sig: z.string(),
});

export type AgentCard = z.infer<typeof AgentCardSchema>;

export type VerificationLevel = "L0" | "L1" | "L2" | "L3";

/**
 * The *effective* level is the highest level whose checks are actually true.
 * The UI must show this — not the aspirational level the agent wishes it had.
 */
export function effectiveLevel(card: AgentCard): VerificationLevel {
  if (card.verification.screening !== "unknown") return "L3";
  if (card.verification.capability_probe) return "L2";
  if (card.verification.owner_binding) return "L1";
  return "L0";
}

export const LEVEL_DESCRIPTION: Record<VerificationLevel, string> = {
  L0: "Self-declared, self-signed — proves the card belongs to this key, nothing more.",
  L1: "Owner binding — the claimed owner controls the stated account/domain (demo-level).",
  L2: "Capability self-test — a signed probe result; evidence the capability runs.",
  L3: "External screening — checked against a list (synthetic in the demo). Real identity: not claimed.",
};

export function isExpired(card: AgentCard, now: Date = new Date()): boolean {
  if (!card.expires_at) return false;
  return new Date(card.expires_at).getTime() < now.getTime();
}

/** The bytes that get signed: the card without its `sig` field. */
export function cardSigningPayload(card: AgentCard): Omit<AgentCard, "sig"> {
  const { sig: _sig, ...rest } = card;
  return rest;
}
