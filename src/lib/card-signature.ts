import { verifyValue, withoutSignature } from "./keys";
import type { ResultCard } from "./result-card";

/**
 * Signature verdicts for result cards (server only — it uses node:crypto).
 *
 * What a verdict proves, and what it does not. It proves the card was signed by
 * the holder of the private key matching the key the card names in `author`, and
 * that nothing in the card has changed since — the check recomputes over the
 * card minus its `sig` field, so an edit to any field breaks it.
 *
 * It does **not** prove the issuer is who the card claims to be. That is a
 * separate question, answered by the issuer's own published directory: fetch the
 * key from `/.well-known/agent-commons-keys` and compare. A card verifying
 * against a key it supplied itself is self-consistency, not identity, and the UI
 * must not describe it as more.
 *
 * **Verify the posted cards, never the merged row.** `mergeResultCards` unions
 * `agreed_by` across every card over a hash, so the merged row is a view that no
 * issuer ever signed; checking it would fail on exactly the rooms where two
 * sides genuinely agreed. The signature belongs to each card as posted, and the
 * honest summary of a room is how many of those verify.
 */

export type SignatureVerdict = "verifies" | "unsigned" | "invalid";

export interface SignatureSummary {
  total: number;
  verified: number;
  unsigned: number;
  invalid: number;
}

export function cardSignatureVerdict(card: ResultCard): SignatureVerdict {
  if (!card.sig) return "unsigned";
  return verifyValue(withoutSignature(card), card.sig, card.author) ? "verifies" : "invalid";
}

/** Roll the posted cards over one terms hash into a verdict summary. */
export function signatureSummary(cards: ResultCard[]): SignatureSummary {
  const summary: SignatureSummary = { total: cards.length, verified: 0, unsigned: 0, invalid: 0 };
  for (const card of cards) {
    const verdict = cardSignatureVerdict(card);
    if (verdict === "verifies") summary.verified += 1;
    else if (verdict === "unsigned") summary.unsigned += 1;
    else summary.invalid += 1;
  }
  return summary;
}

/** A short, honest label for the summary, for use in a badge. */
export function signatureLabel(summary: SignatureSummary): string {
  if (summary.total === 0) return "no card";
  if (summary.invalid > 0) return "signature invalid";
  if (summary.unsigned > 0) return "no signature";
  return summary.verified === 1 ? "signature verifies" : `${summary.verified} signatures verify`;
}

/** Green only when every posted card over the hash verified. */
export function signatureTone(summary: SignatureSummary): "green" | "red" | "neutral" {
  if (summary.total === 0) return "neutral";
  if (summary.invalid > 0) return "red";
  if (summary.unsigned > 0) return "neutral";
  return "green";
}
