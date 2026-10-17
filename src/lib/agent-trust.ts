import { assessCard, type AgentCard } from "./agent-card";
import { demoBuyerCard, demoExpiredCard, demoFlaggedCard, verifyCard } from "./agent-card-demo";
import { trustBadges, type TrustBadge } from "./trust-badges";

/**
 * Seeded agent cards and their trust badges (server only — card signatures are
 * checked with node:crypto). In the demo story only some counterparties share
 * a card; the rest are honestly shown as "profile not shared".
 */

/** Agent cards presented in a room, buyer first — the same set the room page shows. */
export function cardsForRoom(roomId: string): AgentCard[] {
  if (roomId === "room-shell") return [demoBuyerCard(), demoFlaggedCard()];
  if (roomId === "room-northwind") return [demoBuyerCard(), demoExpiredCard()];
  return [demoBuyerCard()];
}

export interface AgentTrust {
  name: string;
  company: string;
  badges: TrustBadge[];
  lapsed: boolean;
}

export function trustOf(card: AgentCard): AgentTrust {
  const assessment = assessCard(card, verifyCard(card));
  const flagged = card.claims.screening.evidence?.payload.matched === true;
  return {
    name: card.display_name,
    company: card.owner.name,
    badges: trustBadges(assessment, { flagged }),
    lapsed: assessment.lapsed,
  };
}

/** Your own agent, as seeded. */
export function buyerTrust(): AgentTrust {
  return trustOf(demoBuyerCard());
}

/** The counterparty's card in a room, or null when it shared none. */
export function counterpartyTrust(roomId: string): AgentTrust | null {
  const [, other] = cardsForRoom(roomId);
  return other ? trustOf(other) : null;
}

/** What the person's own seeded agent is set up with — the editable parts of its card. */
export function buyerProfile() {
  const card = demoBuyerCard();
  return {
    contact: card.owner.contact,
    capabilities: card.capabilities,
    policy: { may: card.owner_policy.may_disclose, never: card.owner_policy.must_not_disclose },
  };
}
