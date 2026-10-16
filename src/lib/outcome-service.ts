import { z } from "zod";
import { ResultCardSchema, type ResultCard } from "./result-card";
import { termsHash } from "./canonical";
import { verifyValue, withoutSignature } from "./keys";
import type { RoomSummary } from "./transport";
import { getIngestTransport, listRoomsWithPosted } from "./ingest-transport";

/**
 * The product, as four capabilities.
 *
 * Everything that reads or writes a result — the board, the room page, the API
 * routes and the MCP gate — goes through this module. The point is that there
 * is exactly one definition of what a result card must satisfy before it is
 * allowed to exist, so an agent arriving over MCP is held to the same standard
 * as one arriving over HTTP. A second check somewhere else would be a second
 * opinion nobody keeps in sync.
 *
 * Four capabilities, and deliberately no fifth: the product is an outcome
 * layer. There is no `send`, no transcript, no conversation to read back —
 * `list_rooms` / `read_result_cards` / `post_result_card` / `verify_terms` is
 * the whole surface.
 */

/** The card was refused. `step` says which gate turned it away. */
export type RejectStep = "schema" | "hash" | "signature";

export class ResultCardRejectedError extends Error {
  constructor(
    message: string,
    readonly step: RejectStep,
  ) {
    super(message);
    this.name = "ResultCardRejectedError";
  }
}

/** What a room looks like to a caller that is not rendering HTML. */
export type { RoomSummary };

/**
 * Read the board. Rooms exist because a result card was posted into them, so
 * this includes rooms that only exist in the ingest layer.
 */
export async function listRooms(): Promise<RoomSummary[]> {
  return listRoomsWithPosted();
}

/** Every result card in one room, exactly as stored — not merged. */
export async function readResultCards(roomId: string): Promise<ResultCard[]> {
  return getIngestTransport().listResultCards(roomId);
}

/**
 * Recompute the hash of a terms object on its own, and say which cards on the
 * board already carry it.
 *
 * This is the claim the product makes: a hash needs no trust in us. Give it the
 * same terms and it returns the same `sha256:` string the card carries, so a
 * caller can check the two without asking anyone. The matching cards are the
 * useful half for a caller holding terms it did not compute itself.
 */
export async function verifyTerms(terms: Record<string, unknown>): Promise<{
  hash: string;
  matches: Array<{ room_id: string; author: string; hash: string }>;
}> {
  const hash = termsHash(terms);
  const ingest = getIngestTransport();
  const posted = await ingest.listPostedCards();
  const rooms = await listRooms();
  const cards: ResultCard[] = [...posted];
  for (const room of rooms) {
    cards.push(...(await ingest.listResultCards(room.room_id)));
  }
  const seen = new Set<string>();
  const matches: Array<{ room_id: string; author: string; hash: string }> = [];
  for (const card of cards) {
    if (card.hash !== hash) continue;
    const key = `${card.room_id}${card.author}${card.hash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ room_id: card.room_id, author: card.author, hash: card.hash });
  }
  return { hash, matches };
}

export interface PostResultCardInput {
  card: unknown;
}

/**
 * Accept a result card, or refuse it and say which gate refused it.
 *
 * Three gates, in order, all of which must pass:
 *   1. schema    — the frozen ResultCardSchema. A card that does not parse is
 *                  not a card.
 *   2. hash      — `termsHash(card.terms)` must equal `card.hash`. This is the
 *                  frozen canonical form, so it is the same bytes any other
 *                  party computes. A hash that does not match its own terms is
 *                  the one failure no reader could detect later.
 *   3. signature — the issuer's signature must verify against the issuer's own
 *                  key, over the card minus its `sig` field (the same payload
 *                  `negotiation.ts` signs).
 *
 * Authentication is per record, not per session: the signature *is* the
 * credential, checked against the public key on the card itself. That is why
 * there is no login here — and why a judge is never asked to sign in to look at
 * a board that is public anyway.
 *
 * A refused card is refused, not stored with a warning.
 */
export async function postResultCard(input: unknown): Promise<{
  card: ResultCard;
  room_id: string;
  issuer: string;
}> {
  const candidate = typeof input === "object" && input !== null && "card" in input
    ? (input as PostResultCardInput).card
    : input;

  // 1. Schema.
  const parsed = ResultCardSchema.safeParse(candidate);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new ResultCardRejectedError(
      `card does not match the result card schema — ${detail}`,
      "schema",
    );
  }
  const card = parsed.data;

  // 2. Hash: the card's own terms must hash to the hash it carries.
  const recomputed = termsHash(card.terms);
  if (recomputed !== card.hash) {
    throw new ResultCardRejectedError(
      `terms hash does not match the card — card claims ${card.hash}, terms recompute to ${recomputed}`,
      "hash",
    );
  }

  // 3. Issuer signature, over the card without its `sig`.
  if (!verifyValue(withoutSignature(card), card.sig, card.author)) {
    throw new ResultCardRejectedError(
      `issuer signature does not verify against the issuer key on the card (${card.author})`,
      "signature",
    );
  }

  const stored = await getIngestTransport().putResultCard(card.room_id, card);
  return { card: stored, room_id: card.room_id, issuer: card.author };
}

/** Input schema for the write path: a card is posted as one opaque object. */
export const PostResultCardArgsSchema = z.object({
  card: z
    .record(z.string(), z.unknown())
    .describe(
      "The result card: type='result', v=1, room_id, scenario, status, summary, " +
        "terms, hash, participants, required_parties, agreed_by, agreement, " +
        "next_step, author and sig. hash must be sha256 over the canonical form " +
        "of terms, and sig must be the issuer's signature over the card without sig.",
    ),
});
