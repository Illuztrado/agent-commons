import { withoutSignature } from "./keys";
import type { ResultCard } from "./result-card";

/**
 * VC 2.0-*shaped* export of a result card.
 *
 * Purpose: let the deck and the README anchor our private result-card design to
 * a public standard — the W3C Verifiable Credentials Data Model 2.0 (a W3C
 * Recommendation since 2025-05-15) — without pretending we *are* a VC
 * implementation. The field-by-field mapping, including every field that has
 * no VC 2.0 counterpart, lives in docs/vc-2.0-mapping.md.
 *
 * Bounded claims, enforced in code and not only in prose:
 *  - "VC 2.0-shaped" only. No VC securing mechanism is emitted (no Data
 *    Integrity `proof`, no VC-JOSE envelope), so this export is not a *secured*
 *    VC in the standard's sense and must never be described as one.
 *  - The frozen result-card schema (result-card.ts) is untouched; this module
 *    only reads a card and re-shapes it. The hash rule (canonical.ts) and the
 *    Ed25519 wire signature (keys.ts) are unchanged too.
 *  - `credentialSubject` is the card minus its `sig`, byte for byte under the
 *    pinned canonical rule — the exact bytes the author signed. The author's
 *    existing signature therefore verifies against the export with the same
 *    canonical.ts rule. (Merged multi-card rooms carry a documented caveat;
 *    see the mapping doc.)
 */

/** The W3C VC 2.0 base context — the specification fixes this as the first entry. */
export const VC2_CONTEXT = "https://www.w3.org/ns/credentials/v2";

/**
 * Private type marker riding alongside the required `VerifiableCredential`
 * token. Not a registered VC type; it names our own export shape.
 */
export const RESULT_CARD_VC_TYPE = "AgentCommonsResultCard";

export interface Vc2Shaped {
  "@context": string[];
  type: string[];
  /**
   * VC 2.0 expects a URI here. `author` is the agent id — base64url of a raw
   * 32-byte Ed25519 public key — which is not a URI. Documented mismatch; we
   * do not mint a did:key we can neither resolve nor publish.
   */
  issuer: { id: string };
  /**
   * The card minus `sig`, verbatim: the same canonical bytes the author
   * signed. No `id` — the card has no URI identity for its subject.
   */
  credentialSubject: Omit<ResultCard, "sig">;
  /**
   * The card's wire signature, verbatim. Deliberately NOT a VC `proof`: VC 2.0
   * delegates securing to registered mechanisms, and our
   * Ed25519-over-canonical-JSON signature is not one of them.
   */
  sig: string;
}

export function resultCardToVc2Shape(card: ResultCard): Vc2Shaped {
  return {
    "@context": [VC2_CONTEXT],
    type: ["VerifiableCredential", RESULT_CARD_VC_TYPE],
    issuer: { id: card.author },
    credentialSubject: withoutSignature(card),
    sig: card.sig,
  };
}
