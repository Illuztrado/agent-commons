import { z } from "zod";
import { termsHash } from "./canonical";

/**
 * The typed result card — the one message schema Agent Commons adds on top of
 * plain chat. It is *optional*: an agent can chat without ever posting one.
 * It is the machine-readable outcome artifact that views and external tools
 * consume.
 */

export const ResultStatusSchema = z.enum(["agreed", "impasse", "no-match"]);
export type ResultStatus = z.infer<typeof ResultStatusSchema>;

export const AgreementSchema = z.enum(["full", "partial"]);
export type Agreement = z.infer<typeof AgreementSchema>;

export const ResultCardSchema = z.object({
  type: z.literal("result"),
  v: z.literal(1),
  room_id: z.string(),
  scenario: z.string(),
  status: ResultStatusSchema,
  summary: z.string(),
  /** Scenario-specific payload (supplier terms, compatibility summary, ...). */
  terms: z.record(z.string(), z.unknown()),
  /** sha256 over the canonical form of `terms` — independently recomputable. */
  hash: z.string(),
  /** Every agent id in the room. */
  participants: z.array(z.string()),
  /** The subset whose agreement is required for a full result. */
  required_parties: z.array(z.string()),
  /** Which required parties have posted an agreed card over this same hash. */
  agreed_by: z.array(z.string()),
  agreement: AgreementSchema,
  next_step: z.string().nullable(),
  /** Authoring agent id (public key). */
  author: z.string(),
  sig: z.string(),
});

export type ResultCard = z.infer<typeof ResultCardSchema>;

export interface BuildResultCardInput {
  room_id: string;
  scenario: string;
  status: ResultStatus;
  summary: string;
  terms: Record<string, unknown>;
  participants: string[];
  required_parties: string[];
  agreed_by?: string[];
  next_step?: string | null;
  author: string;
}

/**
 * A room may display "agreed" only when **every** required party has posted an
 * agreed card over the same hash. Partial agreement is a first-class, visible
 * state — it is never rendered as complete agreement.
 */
export function computeAgreement(
  requiredParties: string[],
  agreedBy: string[],
): Agreement {
  if (requiredParties.length === 0) return "partial";
  const agreed = new Set(agreedBy);
  const all = requiredParties.every((p) => agreed.has(p));
  return all ? "full" : "partial";
}

export function buildResultCard(input: BuildResultCardInput): ResultCard {
  const agreedBy = input.agreed_by ?? [];
  return {
    type: "result",
    v: 1,
    room_id: input.room_id,
    scenario: input.scenario,
    status: input.status,
    summary: input.summary,
    terms: input.terms,
    hash: termsHash(input.terms),
    participants: input.participants,
    required_parties: input.required_parties,
    agreed_by: agreedBy,
    agreement: computeAgreement(input.required_parties, agreedBy),
    next_step: input.next_step ?? null,
    author: input.author,
    sig: "",
  };
}

/** Group cards by hash and merge each required party's agreement into one row. */
export function mergeResultCards(cards: ResultCard[]): ResultCard[] {
  const byHash = new Map<string, ResultCard[]>();
  for (const card of cards) {
    const list = byHash.get(card.hash) ?? [];
    list.push(card);
    byHash.set(card.hash, list);
  }
  const merged: ResultCard[] = [];
  for (const [, group] of byHash) {
    const head = group[0];
    // A party agrees by posting its own card over this hash; the union of every
    // card's `agreed_by` is who has agreed. Never derive this from `author`.
    const agreedBy = Array.from(
      new Set(
        group
          .filter((c) => c.status === "agreed")
          .flatMap((c) => c.agreed_by),
      ),
    );
    merged.push({
      ...head,
      agreed_by: agreedBy,
      agreement: computeAgreement(head.required_parties, agreedBy),
    });
  }
  return merged;
}
