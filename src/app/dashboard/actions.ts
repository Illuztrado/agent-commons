"use server";

import { termsHash } from "@/lib/canonical";

/**
 * Independent hash verification for the dashboard.
 *
 * `canonical.ts` hashes with node:crypto, so recomputation can only run on the
 * server. This action imports the *same* `termsHash` the seed used — no
 * normalization logic is reimplemented anywhere on the dashboard path, which is
 * the whole point: if the client had its own copy, a "match" would prove nothing.
 */

export interface RecomputeResult {
  /** The hash stored on the card. */
  stored: string;
  /** The hash recomputed from `terms` just now. */
  recomputed: string;
  match: boolean;
}

export async function recomputeFromTerms(input: {
  terms: Record<string, unknown>;
  storedHash: string;
}): Promise<RecomputeResult> {
  const recomputed = termsHash(input.terms);
  return {
    stored: input.storedHash,
    recomputed,
    match: recomputed === input.storedHash,
  };
}
