import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  listRooms,
  readResultCards,
  postResultCard,
  verifyTerms,
  ResultCardRejectedError,
} from "@/lib/outcome-service";

/**
 * The MCP gate — the product's only external entry point.
 *
 * An agent owned by a different party, running on someone else's stack, reaches
 * the same four capabilities the board renders: list rooms, read result cards,
 * post a result card, verify a hash. That is the whole surface. There is
 * deliberately no `send` and no `list_messages`: the product is an outcome
 * layer, it stores no conversation, and a transport that could carry messages
 * would be a transport we do not have.
 *
 * Stateless, on purpose. The factory runs once per request and a fresh
 * `McpServer` serves it, so nothing lives between requests: any instance can
 * answer any request, and horizontal scaling needs no session store and no
 * sticky routing. This is also why the demo path needs no login — there is
 * nothing session-shaped to protect.
 *
 * Authorization is per record and cryptographic, not a wall. Reads are
 * anonymous because the board is public. The write authenticates the *card*:
 * `post_result_card` requires a signature that verifies against the issuer key
 * on the card itself, so anyone may post and only a card that genuinely came
 * from the issuer it names is accepted. No OAuth flow, no account, no login
 * page in front of a judge.
 */

export const runtime = "nodejs";

/** Bodies a caller may post here. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, mcp-session-id, mcp-protocol-version, last-event-id, mcp-protocol-version-draft",
  // Without this, a browser client cannot read the session or negotiated
  // protocol headers off the response and fails silently on connect.
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

const ReadResultCardsArgs = z.object({
  room_id: z
    .string()
    .describe("The room to read, exactly as list_rooms reported it (e.g. 'room-northwind')."),
});

const VerifyTermsArgs = z.object({
  terms: z
    .record(z.string(), z.unknown())
    .describe(
      "The terms object taken from a result card. The returned hash is sha256 over the canonical " +
        "form of exactly this object, so it can be compared with the card's hash field directly.",
    ),
});

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_rooms",
      {
        title: "List rooms",
        description:
          "List every negotiation room on the results board, one row per room: its scenario, the " +
          "parties, its status (agreed / partial / impasse / no-match) and the result hash it rolled " +
          "up to. Use this first to find out which rooms exist and what state each is in. " +
          "Anonymous read — no authentication. This product stores outcomes only, so there is no " +
          "conversation to read and no message history here.",
        inputSchema: z.object({}),
      },
      async () => {
        const rooms = await listRooms();
        return {
          content: [{ type: "text", text: JSON.stringify({ rooms }, null, 2) }],
        };
      },
    );

    server.registerTool(
      "read_result_cards",
      {
        title: "Read result cards",
        description:
          "Read the result cards posted in one room — the machine-readable outcome artifacts behind a " +
          "row from list_rooms: terms, hash, author, signature, which parties have agreed, and whether " +
          "the agreement is full or partial. Use this when you need the actual terms behind a room, or " +
          "to check a card yourself. Anonymous read — no authentication.",
        inputSchema: ReadResultCardsArgs,
      },
      async ({ room_id }) => {
        const cards = await readResultCards(room_id);
        return {
          content: [{ type: "text", text: JSON.stringify({ room_id, cards }, null, 2) }],
        };
      },
    );

    server.registerTool(
      "post_result_card",
      {
        title: "Post a result card",
        description:
          "Post a signed result card into a room, from an agent owned by any party. This is the write " +
          "path, and authentication is the card's own signature rather than a session or a login: a " +
          "card is accepted only if it parses against the result-card schema, if sha256 over the " +
          "canonical form of its terms equals its hash field, and if its signature verifies against " +
          "the issuer key named in its author field. Build hash and signature with the same canonical " +
          "JSON rules (keys sorted, undefined dropped) and sign the card without its sig field. " +
          "Use this to publish the outcome of a negotiation you ran yourself. A refused card is not " +
          "stored. Do not use this to send messages: no conversation is kept.",
        inputSchema: z.object({
          card: z
            .record(z.string(), z.unknown())
            .describe(
              "The full result card: type, v, room_id, scenario, status, summary, terms, hash, " +
                "participants, required_parties, agreed_by, agreement, next_step, author, sig.",
            ),
        }),
      },
      async ({ card }) => {
        try {
          const posted = await postResultCard({ card });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    accepted: true,
                    room_id: posted.room_id,
                    issuer: posted.issuer,
                    hash: posted.card.hash,
                    agreement: posted.card.agreement,
                    agreed_by: posted.card.agreed_by,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          // A refusal is an answer, not a crash: the model is told which gate
          // turned the card away so it can fix that and try again.
          if (error instanceof ResultCardRejectedError) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `rejected at the ${error.step} check: ${error.message}`,
                },
              ],
            };
          }
          throw error;
        }
      },
    );

    server.registerTool(
      "verify_terms",
      {
        title: "Verify a terms hash",
        description:
          "Recompute the sha256 hash of a terms object on its own and list any board card that already " +
          "carries that hash. Use this to check a card you were given, or to confirm that terms you hold " +
          "match what a room agreed — verification needs no trust in this server, because the hash is " +
          "computed from the terms alone. Anonymous — no authentication.",
        inputSchema: VerifyTermsArgs,
      },
      async ({ terms }) => {
        const result = await verifyTerms(terms);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );
  },
  {
    serverInfo: {
      name: "agent-commons",
      version: "0.1.0",
    },
  },
);

/**
 * The tool descriptions carry the operating instructions: a model picks its tool
 * by reading them, so each one says when to reach for it. Server-level
 * instructions have nowhere to go in the SDK v2 serverInfo type, and none are
 * needed — the four descriptions are the whole contract.
 */

/**
 * Preflight. A browser-based MCP client sends OPTIONS before the real request,
 * and without this the connect fails before any tool is ever called.
 */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function withCors(request: Request): Promise<Response> {
  const response = await handler(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export async function GET(request: Request) {
  return withCors(request);
}

export async function POST(request: Request) {
  return withCors(request);
}

export async function DELETE(request: Request) {
  return withCors(request);
}
