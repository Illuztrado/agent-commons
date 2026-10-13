import { generateAgentKeyPair, signValue, verifyValue } from "./keys";
import { cardSigningPayload, type AgentCard, type Claim, type Evidence } from "./agent-card";

/**
 * Demo agent cards with real Ed25519 evidence objects.
 *
 * Honesty rules applied here (after review):
 *  - No bare booleans. Every claim is evidence / self_reported / unverified.
 *  - `produced_by` is only a label; the trust anchor is `issuer` — the producer's
 *    public key — so a receiver checks a signature against a key.
 *  - Owner binding is signed by the OWNER's own key and binds the challenge to
 *    the agent key, so a receiver can actually validate it.
 *  - Capability probe and screening are marked `self_reported`: their signature
 *    proves authorship of a result, not independent execution.
 */

interface KeyPairLike {
  publicKeyRaw: string;
  privateKey: import("node:crypto").KeyObject;
}

// Each agent holds its own key; each owner holds a separate key of their own.
const buyerKeys = generateAgentKeyPair();
const buyerOwnerKeys = generateAgentKeyPair();
const supplierKeys = generateAgentKeyPair();
const supplierOwnerKeys = generateAgentKeyPair();
const flaggedKeys = generateAgentKeyPair();

function evidence(
  producer: KeyPairLike,
  type: Evidence["type"],
  method: string,
  produced_by: Evidence["produced_by"],
  payload: Record<string, unknown>,
): Evidence {
  return {
    type,
    method,
    produced_by,
    issuer: producer.publicKeyRaw,
    issued_at: new Date().toISOString(),
    payload,
    evidence_sig: signValue(payload, producer.privateKey),
  };
}

function claim(status: Claim["status"], ev: Evidence | null, note?: string): Claim {
  return { status, evidence: ev, ...(note ? { note } : {}) };
}

function finalize(card: Omit<AgentCard, "sig">, keys: KeyPairLike): AgentCard {
  return { ...card, sig: signValue(card, keys.privateKey) };
}

/** A well-formed buyer agent. */
export function demoBuyerCard(): AgentCard {
  const agentId = buyerKeys.publicKeyRaw;
  return finalize(
    {
      type: "agent_card",
      v: 1,
      agent_id: agentId,
      display_name: "Acme Buyer Agent",
      owner: { name: "Acme Corp", contact: "procurement@acme.example" },
      purpose: ["commercial-terms"],
      capabilities: ["negotiate-price", "verify-spec", "constraint-check"],
      owner_policy: {
        may_disclose: ["spec", "quantity", "target-price-range", "delivery-window"],
        must_not_disclose: ["walk-away-price", "internal-cost-basis"],
      },
      claims: {
        key_control: claim(
          "evidence",
          evidence(buyerKeys, "signature", "ed25519-over-card", "self", { agent_id: agentId }),
          "The card signature itself — verifiable by anyone.",
        ),
        // Signed by the OWNER's key, and bound to this agent's key.
        owner_binding: claim(
          "evidence",
          evidence(buyerOwnerKeys, "domain-challenge", "owner-key-signs-challenge", "owner", {
            agent_id: agentId,
            nonce: "a7f3c1e0",
            contact: "procurement@acme.example",
            scope: "key-control-only",
          }),
          "Proves the owner's key controls this agent key. Not a legal identity, not company authority.",
        ),
        // Self-reported: our signature proves we authored this result.
        capability_probe: claim(
          "self_reported",
          evidence(buyerKeys, "probe-result", "probe.constraint-check.v1", "self", {
            agent_id: agentId,
            probe: "constraint-check",
            result: "pass",
          }),
          "Self-reported. Proves authorship of the result, not independent execution.",
        ),
        screening: claim(
          "self_reported",
          evidence(buyerKeys, "list-check", "local-list-check-v1", "self", {
            agent_id: agentId,
            list: "synthetic-demo-list-v1",
            list_version: "2026-10-13",
            matched: false,
          }),
          "Self-reported. A local list check — no independent authority is involved.",
        ),
      },
      expires_at: "2026-11-30T00:00:00Z",
      revocation: { revoked: false, reason: null, at: null },
    },
    buyerKeys,
  );
}

/** A counterparty whose self-reported screening result trips the synthetic list. */
export function demoFlaggedCard(): AgentCard {
  const agentId = flaggedKeys.publicKeyRaw;
  return finalize(
    {
      type: "agent_card",
      v: 1,
      agent_id: agentId,
      display_name: "Shell-Co Agent",
      owner: { name: "Shell Co", contact: "ops@shell-co.example" },
      purpose: ["commercial-terms"],
      capabilities: ["negotiate-price"],
      owner_policy: { may_disclose: ["spec", "quantity"], must_not_disclose: [] },
      claims: {
        key_control: claim(
          "evidence",
          evidence(flaggedKeys, "signature", "ed25519-over-card", "self", { agent_id: agentId }),
        ),
        // Nothing claimed that cannot be shown.
        owner_binding: claim("unverified", null, "No owner-binding evidence supplied."),
        capability_probe: claim(
          "self_reported",
          evidence(flaggedKeys, "probe-result", "probe.constraint-check.v1", "self", {
            agent_id: agentId,
            probe: "constraint-check",
            result: "pass",
          }),
          "Self-reported, and the screening result below contradicts the claim.",
        ),
        screening: claim(
          "self_reported",
          evidence(flaggedKeys, "list-check", "local-list-check-v1", "self", {
            agent_id: agentId,
            list: "synthetic-demo-list-v1",
            list_version: "2026-10-13",
            matched: true,
            match_reason: "synthetic flag: dissolved entity",
          }),
          "Self-reported list match — the room holds negotiation until a human clears it.",
        ),
      },
      expires_at: null,
      revocation: { revoked: false, reason: null, at: null },
    },
    flaggedKeys,
  );
}

/** A card whose authority claims have lapsed but whose key still authenticates. */
export function demoExpiredCard(): AgentCard {
  const agentId = supplierKeys.publicKeyRaw;
  return finalize(
    {
      type: "agent_card",
      v: 1,
      agent_id: agentId,
      display_name: "Northwind Supply Agent",
      owner: { name: "Northwind Supply", contact: "sales@northwind.example" },
      purpose: ["commercial-terms"],
      capabilities: ["negotiate-price", "verify-spec"],
      owner_policy: { may_disclose: ["spec", "quantity", "lead-time"], must_not_disclose: ["cost-basis"] },
      claims: {
        key_control: claim(
          "evidence",
          evidence(supplierKeys, "signature", "ed25519-over-card", "self", { agent_id: agentId }),
        ),
        owner_binding: claim(
          "evidence",
          evidence(supplierOwnerKeys, "domain-challenge", "owner-key-signs-challenge", "owner", {
            agent_id: agentId,
            nonce: "b2d4",
            contact: "sales@northwind.example",
            scope: "key-control-only",
          }),
        ),
        capability_probe: claim(
          "self_reported",
          evidence(supplierKeys, "probe-result", "probe.constraint-check.v1", "self", {
            agent_id: agentId,
            probe: "constraint-check",
            result: "pass",
          }),
        ),
        screening: claim(
          "self_reported",
          evidence(supplierKeys, "list-check", "local-list-check-v1", "self", {
            agent_id: agentId,
            matched: false,
          }),
        ),
      },
      // Already expired: authority claims lapse, key authentication does not.
      expires_at: "2026-10-01T00:00:00Z",
      revocation: { revoked: false, reason: null, at: null },
    },
    supplierKeys,
  );
}

/** Re-check the card signature — key authentication (L0), independent of claims. */
export function verifyCard(card: AgentCard): boolean {
  return verifyValue(cardSigningPayload(card), card.sig, card.agent_id);
}

/**
 * Re-check an evidence object against its stated issuer key.
 * Note: this validates authorship. It does NOT establish independent execution.
 */
export function verifyEvidence(ev: Evidence): boolean {
  if (!ev.issuer) return false;
  return verifyValue(ev.payload, ev.evidence_sig, ev.issuer);
}
