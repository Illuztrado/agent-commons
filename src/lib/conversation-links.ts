/**
 * Links from a deal to the agents' own conversation in their external channel
 * (e.g. a Muse Relay room). The product keeps outcomes, not transcripts, so the
 * conversation is only ever linked to, never copied in.
 *
 * Set CONVERSATION_LINKS to a JSON object of room id → URL, e.g.
 *   CONVERSATION_LINKS='{"room-northwind":"https://…"}'
 * Rooms without an entry show no link.
 */

let cache: Record<string, string> | null = null;

function links(): Record<string, string> {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(process.env.CONVERSATION_LINKS ?? "{}");
    cache =
      parsed && typeof parsed === "object"
        ? Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === "string" && /^https?:\/\//.test(e[1]),
            ),
          )
        : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function conversationUrl(roomId: string): string | null {
  return links()[roomId] ?? null;
}
