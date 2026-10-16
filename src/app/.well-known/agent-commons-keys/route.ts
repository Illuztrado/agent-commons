import { NextResponse } from "next/server";
import { listRooms, readResultCards } from "@/lib/outcome-service";
import { publicKeyFromRaw } from "@/lib/keys";

/**
 * GET /.well-known/agent-commons-keys
 *
 * The issuer public key directory, in the shape Web Bot Auth uses for
 * `/.well-known/http-message-signatures-directory`: a `keys` array of JWKs that
 * a verifier can fetch and use without asking anyone, including us, whether a
 * key is real.
 *
 * Why this exists. A result card names its issuer in `author` and carries the
 * signature in `sig`. Verifying that signature needs the issuer's *public* key,
 * and a public key handed to you by the party you are verifying is worth
 * nothing. Publishing it at a well-known URL means a third party can fetch the
 * key, and check the card, with no account and no trust in this deployment.
 *
 * What it is not: a key registry. There is no registration API and no rotation
 * here. The directory lists the issuers that actually appear on the board —
 * the public key of every card currently on it — so it is a fact about the
 * data, not a claim about who is allowed in. A key that has posted nothing is
 * absent, and a key that appears here has not thereby been vouched for beyond
 * having signed a card that passed the schema, hash and signature checks.
 *
 * No authentication: this is public data about public cards, and gating it
 * would defeat its only purpose.
 */

export const dynamic = "force-dynamic";

export interface DirectoryKey {
  /** The issuer id: the raw base64url Ed25519 public key, as a card's `author`. */
  kid: string;
  alg: "Ed25519";
  publicKeyJwk: JsonWebKey;
}

function toJwk(publicKeyRaw: string): JsonWebKey | null {
  try {
    return publicKeyFromRaw(publicKeyRaw).export({ format: "jwk" }) as JsonWebKey;
  } catch {
    // An `author` that is not a usable key never got past the signature check on
    // the way in, so this is belt-and-braces. Skip it rather than serve a lie.
    return null;
  }
}

export async function GET() {
  const rooms = await listRooms();
  const issuers = new Map<string, { kid: string; rooms: string[]; cards: number }>();

  for (const room of rooms) {
    for (const card of await readResultCards(room.room_id)) {
      const issuer = card.author;
      if (!issuer) continue;
      const entry = issuers.get(issuer);
      if (entry) {
        entry.cards += 1;
        if (!entry.rooms.includes(room.room_id)) entry.rooms.push(room.room_id);
        continue;
      }
      issuers.set(issuer, { kid: issuer, rooms: [room.room_id], cards: 1 });
    }
  }

  const keys: DirectoryKey[] = [];
  for (const issuer of issuers.keys()) {
    const jwk = toJwk(issuer);
    // An `author` that is not a usable key never got past the signature check on
    // the way in, so this is belt-and-braces. Skip it rather than serve a lie.
    if (jwk) keys.push({ kid: issuer, alg: "Ed25519", publicKeyJwk: jwk });
  }

  return NextResponse.json(
    {
      name: "Agent Commons issuer keys",
      description:
        "Public keys of agents that have posted a result card on this board. Fetch a key here, then " +
        "verify any card independently: hash = sha256 over the canonical JSON of its terms (keys " +
        "sorted, undefined dropped), and signature = Ed25519 over the canonical form of the card " +
        "without its sig field, under this key. No trust in this deployment is required.",
      keys,
      issuers: [...issuers.values()],
    },
    {
      headers: {
        // A directory that a verifier caches must not go stale behind its back.
        "Cache-Control": "public, max-age=60",
      },
    },
  );
}
