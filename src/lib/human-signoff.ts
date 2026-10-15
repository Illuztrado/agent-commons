import { z } from "zod";
import type { ResultCard } from "./result-card";

/**
 * The human terminal step.
 *
 * Negotiation is autonomous; a person enters only at the end. A result card
 * whose `next_step` is `awaiting_signature` is the machine saying "the agents
 * are done, a human has to close this". This module models that close as a
 * separate record bound to the card's terms hash — it never rewrites the
 * agents' card, and it claims no legal signature validity: it is a demo-level
 * confirmation of the terms exactly as hashed.
 */

/** The step the agents stop at, as emitted by negotiation and the seed data. */
export const AWAITING_SIGNATURE = "awaiting_signature";

/** The step a card shows once a human has confirmed it. */
export const SIGNED_OFF = "signed_off";

/** Who confirms when the demo gives no name. */
export const DEFAULT_SIGNER = "demo-human";

/**
 * One human confirmation of one result card. Bound by `(room_id, hash)` so it
 * attaches to those terms and to nothing else — a re-negotiated card with a new
 * hash is not covered by an earlier sign-off.
 */
export const SignOffSchema = z.object({
  room_id: z.string(),
  hash: z.string(),
  /** The person, as they chose to be named. Not an authenticated identity. */
  display_name: z.string(),
  /** ISO instant of the click. */
  signed_off_at: z.string(),
});

export type HumanSignOff = z.infer<typeof SignOffSchema>;

export interface BuildSignOffInput {
  card: ResultCard;
  displayName?: string | null;
  at?: string;
}

/** The card was not in the one state a human is allowed to close. */
export class SignOffRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignOffRejectedError";
  }
}

export function isAwaitingSignature(card: ResultCard): boolean {
  return card.next_step === AWAITING_SIGNATURE;
}

export function buildSignOff(
  input: BuildSignOffInput,
  existing: HumanSignOff[] = [],
): HumanSignOff {
  if (!isAwaitingSignature(input.card)) {
    throw new SignOffRejectedError(
      `this card is not awaiting a human confirmation (next step: ${input.card.next_step ?? "none"})`,
    );
  }
  const already = findSignOff(existing, input.card);
  if (already) {
    throw new SignOffRejectedError(
      `already signed off by ${already.display_name} at ${already.signed_off_at}`,
    );
  }
  const name = input.displayName?.trim() ?? "";
  return SignOffSchema.parse({
    room_id: input.card.room_id,
    hash: input.card.hash,
    display_name: name === "" ? DEFAULT_SIGNER : name,
    signed_off_at: input.at ?? new Date().toISOString(),
  });
}

/** The sign-off that closes these exact terms, if there is one. */
export function signOffFor(
  signOffs: HumanSignOff[],
  roomId: string,
  hash: string,
): HumanSignOff | undefined {
  return signOffs.find((s) => s.room_id === roomId && s.hash === hash);
}

/** The sign-off that closes this exact card, if there is one. */
export function findSignOff(
  signOffs: HumanSignOff[],
  card: ResultCard,
): HumanSignOff | undefined {
  return signOffFor(signOffs, card.room_id, card.hash);
}

/**
 * The step to display: `signed_off` once a human has closed this card,
 * otherwise whatever step the agents left it at. A card that never reached the
 * human step keeps its own next step — no record can close it out of band.
 */
export function cardStage(
  card: ResultCard,
  signOffs: HumanSignOff[],
): string | null {
  if (isAwaitingSignature(card) && findSignOff(signOffs, card)) {
    return SIGNED_OFF;
  }
  return card.next_step ?? null;
}

/** Whether the Confirm affordance should be offered for this card. */
export function canConfirm(
  card: ResultCard,
  signOffs: HumanSignOff[],
): boolean {
  return isAwaitingSignature(card) && !findSignOff(signOffs, card);
}
