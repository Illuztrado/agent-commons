import { NextResponse } from "next/server";
import { getSignOffTransport } from "@/lib/sign-off-transport";
import { SignOffRejectedError } from "@/lib/human-signoff";

/**
 * POST /api/sign-off
 *
 * Records a human confirmation of one result card, bound to the terms hash the
 * person was looking at. This is the terminal step of the demo flow: the agents
 * negotiated, a person closes it. Demo-level — a typed display name and a
 * timestamp, with no legal signature validity claimed or implied.
 *
 * Body: { room_id, hash, display_name? }
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const roomId = typeof body.room_id === "string" ? body.room_id : "";
  const hash = typeof body.hash === "string" ? body.hash : "";
  const displayName = typeof body.display_name === "string" ? body.display_name : null;

  if (!roomId || !hash) {
    return NextResponse.json(
      { error: "room_id and hash are required" },
      { status: 400 },
    );
  }

  try {
    const signOff = await getSignOffTransport().recordSignOff({
      room_id: roomId,
      hash,
      display_name: displayName,
    });
    return NextResponse.json({ sign_off: signOff });
  } catch (error) {
    if (error instanceof SignOffRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
