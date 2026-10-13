import { buildResultCard, type ResultCard } from "./result-card";

/**
 * Multi-party consensus (scenario 4 — friends' gathering).
 *
 * N independently owned agents converge on one shared outcome. Consensus is
 * real: a field is settled only if every required party accepts the same value.
 * The outcome is emitted as a *sequence* of result cards — one per party, in
 * order — so the room can show agreement climbing 1/3 → 2/3 → 3/3 and never
 * rendering partial as full.
 */

export interface MultiParty {
  id: string;
  display_name: string;
  /** Values this party accepts, per shared field. */
  acceptable: {
    date: string[];
    location: string[];
    activity: string[];
  };
}

export interface MultiPartyOutcome {
  status: "agreed" | "no-match";
  terms: Record<string, unknown> | null;
  /** Fields with no common value across all parties. */
  blocked_by: string[];
  /** Result cards in posting order — index i means parties[0..i] have agreed. */
  cards: ResultCard[];
}

const FIELDS = ["date", "location", "activity"] as const;

function intersect(values: string[][]): string[] {
  if (values.length === 0) return [];
  return values.reduce((acc, cur) => acc.filter((v) => cur.includes(v)));
}

export function runMultiPartyNegotiation(input: {
  room_id: string;
  scenario: string;
  parties: MultiParty[];
  sign: (value: unknown) => string;
}): MultiPartyOutcome {
  const { parties, room_id, scenario, sign } = input;

  const common: Record<string, string[]> = {};
  const blocked_by: string[] = [];
  for (const field of FIELDS) {
    const commonValues = intersect(parties.map((p) => p.acceptable[field]));
    common[field] = commonValues;
    if (commonValues.length === 0) blocked_by.push(field);
  }

  const participants = parties.map((p) => p.id);
  const required = [...participants];

  if (blocked_by.length > 0) {
    const card = buildResultCard({
      room_id,
      scenario,
      status: "no-match",
      summary: `No common value for: ${blocked_by.join(", ")}.`,
      terms: Object.fromEntries(blocked_by.map((f) => [f, "no-common-value"])),
      participants,
      required_parties: required,
      agreed_by: [],
      next_step: null,
      author: parties[0].id,
    });
    const { sig: _s, ...payload } = card;
    return { status: "no-match", terms: null, blocked_by, cards: [{ ...card, sig: sign(payload) }] };
  }

  const terms: Record<string, unknown> = {
    date: common.date[0],
    location: common.location[0],
    activity: common.activity[0],
  };

  // Emit one card per party, in order — agreement climbs partial → full.
  const cards: ResultCard[] = [];
  const agreedBy: string[] = [];
  for (const party of parties) {
    agreedBy.push(party.id);
    const card = buildResultCard({
      room_id,
      scenario,
      status: "agreed",
      summary: `Agreed: ${terms.activity} on ${terms.date} at ${terms.location}.`,
      terms,
      participants,
      required_parties: required,
      agreed_by: [...agreedBy],
      next_step: "awaiting_confirmation",
      author: party.id,
    });
    const { sig: _s, ...payload } = card;
    cards.push({ ...card, sig: sign(payload) });
  }

  return { status: "agreed", terms, blocked_by: [], cards };
}
