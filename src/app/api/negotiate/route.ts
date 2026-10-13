import { NextResponse } from "next/server";
import { generateAgentKeyPair, signValue } from "@/lib/keys";
import { negotiateToResultCard, type Party } from "@/lib/negotiation";

/**
 * POST /api/negotiate
 *
 * Runs one autonomous negotiation between two agents and returns the signed
 * result card plus the full round trace. No intermediate human gate.
 *
 * Body (all optional — defaults are the anchor scenario):
 *   { room_id, scenario, baseFields, maxRounds, buyer, seller }
 */

const DEFAULT_BUYER: Party = {
  id: "acme-buyer.demo",
  display_name: "Acme Buyer Agent",
  role: "buyer",
  reservation: 4.8,
  policy: {
    may_disclose: ["spec", "quantity", "target-price-range"],
    must_not_disclose: ["walk-away-price", "internal-cost-basis"],
  },
};

const DEFAULT_SELLER: Party = {
  id: "northwind-seller.demo",
  display_name: "Northwind Supply Agent",
  role: "seller",
  reservation: 4.2,
  policy: {
    may_disclose: ["spec", "quantity", "lead-time"],
    must_not_disclose: ["cost-basis"],
  },
};

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // Merge caller overrides onto the defaults so partial bodies are safe.
  const buyer: Party = { ...DEFAULT_BUYER, ...(body.buyer as Partial<Party> | undefined) };
  const seller: Party = { ...DEFAULT_SELLER, ...(body.seller as Partial<Party> | undefined) };

  const keys = generateAgentKeyPair();
  const { card, outcome } = negotiateToResultCard(
    {
      room_id: (body.room_id as string) ?? "room-live",
      scenario: (body.scenario as string) ?? "commercial-terms",
      buyer,
      seller,
      maxRounds: (body.maxRounds as number) ?? 6,
      baseFields: (body.baseFields as Record<string, unknown>) ?? {
        spec: "A-100",
        quantity: 5000,
      },
    },
    (value) => signValue(value, keys.privateKey),
  );

  return NextResponse.json({
    card,
    outcome,
    signer_public_key: keys.publicKeyRaw,
    // Surfaced so the UI can prove nothing forbidden went on the wire.
    policy_leak: outcome.leaked,
  });
}
