import { NextResponse } from "next/server";
import { createAgentCard, type AgentCardInput } from "@/lib/agent-card-build";
import { assessCard } from "@/lib/agent-card";
import { verifyCard } from "@/lib/agent-card-demo";

/**
 * POST /api/agent-card
 *
 * Builds and signs an agent card from the editor form, then returns the card
 * plus an honest claim-by-claim assessment (evidence / self-reported /
 * unverified). No bare booleans anywhere.
 */
export async function POST(request: Request) {
  let input: AgentCardInput;
  try {
    input = (await request.json()) as AgentCardInput;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!input.display_name || !input.owner_name) {
    return NextResponse.json(
      { error: "display_name and owner_name are required" },
      { status: 400 },
    );
  }

  const card = createAgentCard(input);
  const assessment = assessCard(card, verifyCard(card));
  return NextResponse.json({ card, assessment });
}
