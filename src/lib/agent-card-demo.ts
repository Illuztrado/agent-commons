import { generateAgentKeyPair, signValue, verifyValue } from "./keys";
import { cardSigningPayload, type AgentCard, type Claim, type Evidence } from "./agent-card";

/**
 * Demo agent cards with *real* Ed25519 evidence objects.
 *
 * Every claim below carries a signed evidence payload the receiving agent can
 * check — or is explicitly marked unverified / self-reported. There are no bare
 * booleans. The signatures are produced with the same primitives the room uses,
 * so `verifyCard` genuinely re-checks them.
 */

// One demo key per card. In the real flow each agent holds its own.
const buyerKeys = generateAgentKeyPair();
const supplierKeys = generateAgentKeyPair();
const flaggedKeys = generateAgentKeyPair();

function evidence(
  keys: { privateKey: import("node:crypto").KeyObject },
  type: Evidence["type"],
  method: string,
  produced_by: Evidence["produced_by"],
  payload: Record<string, unknown>,
): Evidence {
  return {
    type,
    method,
    produced_by,
    issued_at: new Date().toISOString(),
    payload,
    evidence_sig: signValue(payload, keys.privateKey),
  };
}

function claim(status: Claim["status"], ev: Evidence | null, note?: string): Claim {
  return { status, evidence: ev, ...(note ? { note } : {}) };
}

function finalize(card: Omit<AgentCard, "sig">, keys: { privateKey: import("node:crypto").KeyObject }): AgentCard {
  return { ...card, sig: signValue(card, keys.privateKey) };
}

/** A well-formed buyer agent: every level carries checkable evidence. */
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
        owner_binding: claim(
          "evidence",
          evidence(buyerKeys, "domain-challenge", "email-domain-challenge", "local-module", {
            domain: "acme.example",
            challenge: "a7f3c1e0",
            // Honest scope: control of a mailbox, not authority to represent the company.
            scope: "mailbox-control-only",
          }),
          "Proves control of the contact, NOT authority to represent Acme Corp.",
        ),
        capability_probe: claim(
          "evidence",
          evidence(buyerKeys, "probe-result", "probe.constraint-check.v1", "self", {
            probe: "constraint-check",
            input_hash: "sha256:demo",
            result: "pass",
          }),
          "Self-produced evidence that the capability runs.",
        ),
        screening: claim(
          "evidence",
          evidence(buyerKeys, "list-check", "synthetic-list-v1", "local-module", {
            list: "synthetic-demo-list-v1",
            list_version: "2026-10-13",
            matched: false,
          }),
          "Checked against a synthetic list by a local module — not an independent authority.",
        ),
      },
      expires_at: "2026-11-30T00:00:00Z",
      revocation: { revoked: false, reason: null, at: null },
    },
    buyerKeys,
  );
}

/** A counterparty whose screening evidence trips the synthetic list. */
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
        key_control: claim("evidence", evidence(flaggedKeys, "signature", "ed25519-over-card", "self", { agent_id: agentId })),
        // Deliberately unverified — the agent claims nothing it cannot show.
        owner_binding: claim("unverified", null, "No owner-binding evidence supplied."),
        capability_probe: claim("self_reported", null, "Agent claims the capability but supplied no probe result."),
        screening: claim(
          "evidence",
          evidence(flaggedKeys, "list-check", "synthetic-list-v1", "local-module", {
            list: "synthetic-demo-list-v1",
            list_version: "2026-10-13",
            matched: true,
            match_reason: "synthetic flag: dissolved entity",
          }),
          "Synthetic list match — the room holds negotiation.",
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
        key_control: claim("evidence", evidence(supplierKeys, "signature", "ed25519-over-card", "self", { agent_id: agentId })),
        owner_binding: claim("evidence", evidence(supplierKeys, "domain-challenge", "email-domain-challenge", "local-module", { domain: "northwind.example", challenge: "b2d4", scope: "mailbox-control-only" })),
        capability_probe: claim("evidence", evidence(supplierKeys, "probe-result", "probe.constraint-check.v1", "self", { probe: "constraint-check", result: "pass" })),
        screening: claim("evidence", evidence(supplierKeys, "list-check", "synthetic-list-v1", "local-module", { matched: false })),
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

/** Re-check an evidence object's own signature. */
export function verifyEvidence(ev: Evidence, publicKeyRaw: string): boolean {
  return verifyValue(ev.payload, ev.evidence_sig, publicKeyRaw);
}
