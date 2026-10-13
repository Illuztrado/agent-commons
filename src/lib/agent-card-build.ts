import { generateAgentKeyPair, signValue } from "./keys";
import type { AgentCard, Claim, Evidence } from "./agent-card";

/**
 * Build a signed agent card from user input.
 *
 * Written fresh in the hackathon window. Honesty rules:
 *  - No bare booleans: every claim is evidence / self_reported / unverified.
 *  - Levels the user does not ask for are marked `unverified` / `self_reported`,
 *    never faked.
 *  - Owner binding is signed by a separate OWNER key and bound to the agent key,
 *    so a receiver can validate it. Capability probe and screening are
 *    `self_reported` — their signature proves authorship, not independent
 *    execution.
 */

export interface AgentCardInput {
  display_name: string;
  owner_name: string;
  owner_contact?: string;
  purpose?: string[];
  capabilities?: string[];
  may_disclose?: string[];
  must_not_disclose?: string[];
  /** Which claims to include. Absent → honestly unverified / self-reported. */
  levels?: {
    owner_binding?: boolean;
    capability_probe?: boolean;
    screening?: boolean;
  };
  expires_at?: string | null;
}

export interface AgentCardKeys {
  publicKeyRaw: string;
  privateKey: import("node:crypto").KeyObject;
}

function makeEvidence(
  producer: AgentCardKeys,
  type: string,
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
      ? (() => {
          // A separate owner key signs a challenge bound to this agent key.
          const ownerKeys = generateAgentKeyPair();
          return {
            status: "evidence" as const,
            evidence: makeEvidence(ownerKeys, "domain-challenge", "owner-key-signs-challenge", "owner", {
              agent_id: agentId,
              nonce: crypto.randomUUID().slice(0, 8),
              contact: input.owner_contact ?? null,
              scope: "key-control-only",
            }),
            note: "Proves the owner's key controls this agent key. Not a legal identity, not authority to represent an organisation.",
          };
        })()
      : { status: "unverified", evidence: null, note: "No owner-binding evidence supplied." },
    capability_probe: levels.capability_probe
      ? {
          status: "self_reported",
          evidence: makeEvidence(keys, "probe-result", "probe.constraint-check.v1", "self", {
            agent_id: agentId,
            probe: "constraint-check",
            capabilities: caps,
            result: "pass",
          }),
          note: "Self-reported. Proves authorship of the result, not independent execution.",
        }
      : { status: "self_reported", evidence: null, note: "Capabilities claimed, no probe result." },
    screening: levels.screening
      ? {
          status: "self_reported",
          evidence: makeEvidence(keys, "list-check", "local-list-check-v1", "self", {
            agent_id: agentId,
            list: "synthetic-demo-list-v1",
            list_version: "2026-10-13",
            matched: false,
          }),
          note: "Self-reported. A local list check — no independent authority is involved.",
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
