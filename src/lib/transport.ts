import type { ResultCard } from "./result-card";
import { mergeResultCards } from "./result-card";
import { SEED_CARDS } from "./seed";

/**
 * Transport boundary.
 *
 * The product is transport-agnostic: Muse Relay is our working channel, but
 * the room layer only needs `listRooms` / `listResultCards` / `send`.
 *
 * D1 (skeleton): the DemoTransport below seeds the anchor story so the board
 * renders end to end. The real Muse Relay bridge (reusing our own MIT
 * `muse-relay/relay.py` — E2EE + Ed25519 member certs) lands in D2 behind the
 * same interface; nothing above this file changes.
 */

export type RoomStatus =
  | "negotiating"
  | "agreed"
  | "partial"
  | "impasse"
  | "no-match";

export interface RoomSummary {
  room_id: string;
  scenario: string;
  scenario_label: string;
  participants: string[];
  status: RoomStatus;
  summary: string;
  hash?: string;
  required_parties: number;
  agreed_parties: number;
  updated_at: string;
}

export interface Transport {
  listRooms(): Promise<RoomSummary[]>;
  listResultCards(roomId: string): Promise<ResultCard[]>;
  send(roomId: string, body: string): Promise<void>;
}

/** Roll per-hash agreement into the room-level status the board shows. */
export function roomStatusFromCards(cards: ResultCard[]): {
  status: RoomStatus;
  hash?: string;
  required: number;
  agreed: number;
} {
  if (cards.length === 0) {
    return { status: "negotiating", required: 0, agreed: 0 };
  }
  const merged = mergeResultCards(cards);
  // Prefer a fully-agreed result, then a partial one, then impasse / no-match.
  const full = merged.find((c) => c.status === "agreed" && c.agreement === "full");
  if (full) {
    return {
      status: "agreed",
      hash: full.hash,
      required: full.required_parties.length,
      agreed: full.agreed_by.length,
    };
  }
  const partial = merged.find((c) => c.status === "agreed");
  if (partial) {
    return {
      status: "partial",
      hash: partial.hash,
      required: partial.required_parties.length,
      agreed: partial.agreed_by.length,
    };
  }
  const impasse = merged.find((c) => c.status === "impasse");
  if (impasse) {
    return { status: "impasse", hash: impasse.hash, required: impasse.required_parties.length, agreed: 0 };
  }
  const noMatch = merged.find((c) => c.status === "no-match");
  return { status: "no-match", hash: noMatch?.hash, required: noMatch?.required_parties.length ?? 0, agreed: 0 };
}

export class DemoTransport implements Transport {
  private cards: ResultCard[] = [...SEED_CARDS];

  async listResultCards(roomId: string): Promise<ResultCard[]> {
    return this.cards.filter((c) => c.room_id === roomId);
  }

  async listRooms(): Promise<RoomSummary[]> {
    const byRoom = new Map<string, ResultCard[]>();
    for (const card of this.cards) {
      const list = byRoom.get(card.room_id) ?? [];
      list.push(card);
      byRoom.set(card.room_id, list);
    }
    return Array.from(byRoom.entries()).map(([roomId, cards]) => {
      const head = cards[0];
      const rolled = roomStatusFromCards(cards);
      return {
        room_id: roomId,
        scenario: head.scenario,
        scenario_label: head.scenario,
        participants: head.participants,
        status: rolled.status,
        summary: head.summary,
        hash: rolled.hash,
        required_parties: rolled.required,
        agreed_parties: rolled.agreed,
        updated_at: new Date().toISOString(),
      };
    });
  }

  async send(_roomId: string, _body: string): Promise<void> {
    // Demo transport keeps no message log — the board is outcomes-only.
  }
}

let singleton: Transport | null = null;

export function getTransport(): Transport {
  if (!singleton) singleton = new DemoTransport();
  return singleton;
}
