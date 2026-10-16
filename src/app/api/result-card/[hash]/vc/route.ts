import { NextResponse } from "next/server";
import { getTransport } from "@/lib/transport-factory";
import { mergeResultCards } from "@/lib/result-card";
import { resultCardToVc2Shape } from "@/lib/vc-export";

/**
 * GET /api/result-card/[hash]/vc
 *
 * Read-only export of one result card, wrapped in a VC 2.0-*shaped* envelope
 * (see docs/vc-2.0-mapping.md). `hash` is the card's terms hash, e.g.
 *
 *   GET /api/result-card/sha256:1e25…/vc
 *
 * Shape only — no VC signature suite, no conformance claim, no DID minting.
 * GET only: this route writes nothing, exactly like the board it reads from.
 * Reads live transport state, so it is never statically evaluated.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const transport = getTransport();
  const rooms = await transport.listRooms();
  for (const room of rooms) {
    // The same merge the board and the room page use, so the export cannot
    // disagree with what a viewer sees for this hash.
    const merged = mergeResultCards(await transport.listResultCards(room.room_id));
    const card = merged.find((c) => c.hash === hash);
    if (card) {
      return NextResponse.json(resultCardToVc2Shape(card));
    }
  }
  return NextResponse.json({ error: `no result card with hash ${hash}` }, { status: 404 });
}
