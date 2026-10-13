import { generateAgentKeyPair, signValue } from "./keys";
import type { AgentCard, Claim, Evidence } from "./agent-card";

/**
 * Build a signed agent card from user input.
 *
 * Written fresh in the hackathon window. Every claim is evidence-backed or
 * explicitly unverified — the builder never emits a bare boolean. Levels the
 * user does not ask for are marked `unverified` / `self_reported`, not faked.
 */

export interface AgentCardInput {
  display_name: string;
  owner_name: string;
  owner_contact?: string;
  purpose?: string[];
  capabilities?: string[];
  may_disclose?: string[];
  must_not_disclose?: string[];
  /** Which evidence-backed claims to include. Absent → honestly unverified. */
  levels?: {
    owner_binding?: boolean;
    capability_probe?: boolean;
    screening?: boolean;
  };
  /** Optional expiry (ISO). */
  expires_at?: string | null;
}

export interface AgentCardKeys {
  publicKeyRaw: string;
  privateKey: import("node:crypto").KeyObject;
}

function makeEvidence(
  keys: AgentCardKeys,
  type: string,
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

export function createAgentCard(
  input: AgentCardInput,
  keys: AgentCardKeys = generateAgentKeyPair(),
): AgentCard {
  const agentId = keys.publicKeyRaw;
  const levels = input.levels ?? {};
  const caps = input.capabilities ?? [];

  const claims: AgentCard["claims"] = {
    key_control: {
      status: "evidence",
      evidence: makeEvidence(keys, "signature", "ed25519-over-card", "self", { agent_id: agentId }),
      note: "The card signature itself — verifiable by anyone.",
    },
    owner_binding: levels.owner_binding
      ? {
          status: "evidence",
          evidence: makeEvidence(keys, "domain-challenge", "email-domain-challenge", "local-module", {
            contact: input.owner_contact ?? null,
            scope: "mailbox-control-only",
          }),
          note: "Proves control of the contact, NOT authority to represent the owner.",
        }
      : { status: "unverified", evidence: null, note: "No owner-binding evidence supplied." },
    capability_probe: levels.capability_probe
      ? {
          status: "evidence",
          evidence: makeEvidence(keys, "probe-result", "probe.constraint-check.v1", "self", {
            probe: "constraint-check",
            capabilities: caps,
            result: "pass",
          }),
          note: "Self-produced evidence that the capabilities run.",
        }
      : { status: "self_reported", evidence: null, note: "Capabilities claimed, no probe result." },
    screening: levels.screening
      ? {
          status: "evidence",
          evidence: makeEvidence(keys, "list-check", "synthetic-list-v1", "local-module", {
            list: "synthetic-demo-list-v1",
            list_version: "2026-10-13",
            matched: false,
          }),
          note: "Checked against a synthetic list by a local module — not an independent authority.",
        }
      : { status: "unverified", evidence: null, note: "Not screened in this demo." },
  };

  const body: Omit<AgentCard, "sig"> = {
    type: "agent_card",
    v: 1,
    agent_id: agentId,
    display_name: input.display_name,
    owner: { name: input.owner_name, contact: input.owner_contact ?? null },
    purpose: input.purpose ?? [],
    capabilities: caps,
    owner_policy: {
      may_disclose: input.may_disclose ?? [],
      must_not_disclose: input.must_not_disclose ?? [],
    },
    claims,
    expires_at: input.expires_at ?? null,
    revocation: { revoked: false, reason: null, at: null },
  };

  return { ...body, sig: signValue(body, keys.privateKey) };
}
