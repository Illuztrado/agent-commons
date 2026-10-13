import { NextResponse } from "next/server";
import { generateAgentKeyPair, signValue } from "@/lib/keys";
import { runMultiPartyNegotiation, type MultiParty } from "@/lib/multiparty";

/**
 * POST /api/negotiate-multi
 *
 * Multi-party consensus (scenario 4). Returns the card sequence so the caller
 * can watch agreement climb 1/3 → 2/3 → 3/3, or a no-match with the blocking
 * field. No intermediate human gate.
 */

const FRIENDS: MultiParty[] = [
  {
    id: "alex.demo",
    display_name: "Alex's Agent",
    acceptable: {
      date: ["2026-11-08", "2026-11-09"],
      location: ["Riverside Park", "Corner Cafe"],
      activity: ["picnic", "hiking"],
    },
  },
  {
    id: "bo.demo",
    display_name: "Bo's Agent",
    acceptable: {
      date: ["2026-11-08"],
      location: ["Riverside Park", "City Museum"],
      activity: ["picnic", "movie"],
    },
  },
  {
    id: "cy.demo",
    display_name: "Cy's Agent",
    acceptable: {
      date: ["2026-11-08"],
      location: ["Riverside Park", "Corner Cafe"],
      activity: ["picnic", "board games"],
    },
  },
];

/** Same three friends, but Cy can only do the beach — no common location. */
const FRIENDS_NO_OVERLAP: MultiParty[] = [
  FRIENDS[0],
  FRIENDS[1],
  {
    ...FRIENDS[2],
    acceptable: { ...FRIENDS[2].acceptable, location: ["Bay Beach"] },
  },
];

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const preset = (body.preset as string) ?? "agree";
  const parties = (body.parties as MultiParty[] | undefined) ??
    (preset === "no-match" ? FRIENDS_NO_OVERLAP : FRIENDS);

  const keys = generateAgentKeyPair();
  const outcome = runMultiPartyNegotiation({
    room_id: (body.room_id as string) ?? "room-weekend-live",
    scenario: "friends-gathering",
    parties,
    sign: (value) => signValue(value, keys.privateKey),
  });

  return NextResponse.json({
    status: outcome.status,
    terms: outcome.terms,
    blocked_by: outcome.blocked_by,
    // Agreement after each card, so the UI can show the climb.
    progression: outcome.cards.map((c) => ({
      author: c.author,
      agreed: c.agreed_by.length,
      required: c.required_parties.length,
      agreement: c.agreement,
      hash: c.hash,
      sig: c.sig,
    })),
    final: outcome.cards[outcome.cards.length - 1],
    signer_public_key: keys.publicKeyRaw,
  });
}
