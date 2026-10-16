/**
 * Evidence run for the MCP gate (WS-14) and the key directory (WS-15).
 *
 * Not part of the acceptance suite and not wired into package.json — this is a
 * throwaway harness that drives the gate with the real MCP client so the output
 * below is protocol output, not hand-written JSON-RPC.
 *
 *   node --import tsx scripts/mcp-gate-evidence.mts
 *
 * It signs its own cards with a throwaway keypair generated in-process. No key
 * is read from disk or env, and nothing it writes is a secret.
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { generateAgentKeyPair, signValue, withoutSignature } from "../src/lib/keys";
import { buildResultCard, type ResultCard } from "../src/lib/result-card";

const base = (process.env.GATE_BASE ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const gateUrl = `${base}/mcp`;
const keysUrl = `${base}/.well-known/agent-commons-keys`;

function line(label: string) {
  console.log(`\n===== ${label} =====`);
}

async function connect(): Promise<Client> {
  const client = new Client({ name: "gate-evidence", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(gateUrl)));
  return client;
}

/** A structurally valid, correctly hashed, correctly signed card. */
function signedCard(
  roomId: string,
  keys: { publicKeyRaw: string; privateKey: import("node:crypto").KeyObject },
): ResultCard {
  // Built with the frozen helper the negotiation itself uses, so the card is
  // shaped exactly like one this product produced — only the issuer differs.
  const unsigned = buildResultCard({
    room_id: roomId,
    scenario: "commercial-terms",
    status: "agreed",
    summary: "All commercial terms inside both parties' bounds.",
    terms: { spec: "A-100", quantity: 5000, unit_price: 4.05, lead_time_days: 21 },
    participants: ["Evidence-Issuer.demo", "Acme-Buyer-Agent.demo"],
    required_parties: ["Evidence-Issuer.demo", "Acme-Buyer-Agent.demo"],
    agreed_by: ["Evidence-Issuer.demo"],
    next_step: "awaiting_signature",
    author: keys.publicKeyRaw,
  });
  // Sign over the card without its `sig` field — the same payload
  // `negotiation.ts` signs, so this card verifies under the frozen keys.ts.
  return { ...unsigned, sig: signValue(withoutSignature(unsigned), keys.privateKey) };
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>).map((c) => c.text).join("\n");
  return { isError: result.isError === true, text };
}

const client = await connect();

line("(a) list_rooms — the gate serves the board");
const tools = await client.listTools();
console.log(`tools advertised: ${tools.tools.map((t) => t.name).join(", ")}`);
console.log(`tool count: ${tools.tools.length}`);
const rooms = await call(client, "list_rooms", {});
const roomList = JSON.parse(rooms.text).rooms as Array<{ room_id: string; status: string }>;
console.log(`rooms: ${roomList.map((r) => `${r.room_id}[${r.status}]`).join(", ")}`);
console.log(`room-northwind visible: ${roomList.some((r) => r.room_id === "room-northwind")}`);

line("(e) verify_terms — independent recompute of room-northwind's terms");
const verify = await call(client, "verify_terms", {
  terms: { spec: "A-100", quantity: 5000, unit_price: 4.05, lead_time_days: 21 },
});
console.log(verify.text);

line("(b) post_result_card — a valid signed card");
const keys = generateAgentKeyPair();
const good = signedCard("room-mcp-evidence", keys);
console.log(`issuer (author): ${keys.publicKeyRaw}`);
console.log(`hash on card:    ${good.hash}`);
const before = await (await fetch(`${base}/`)).text();
console.log(`board before: contains room-mcp-evidence = ${before.includes("room-mcp-evidence")}`);
const posted = await call(client, "post_result_card", { card: good });
console.log(`isError: ${posted.isError}`);
console.log(posted.text);
const after = await (await fetch(`${base}/`)).text();
console.log(`board after:  contains room-mcp-evidence = ${after.includes("room-mcp-evidence")}`);

line("(b-cont) the card reads back through the gate");
const readBack = await call(client, "read_result_cards", { room_id: "room-mcp-evidence" });
const cards = JSON.parse(readBack.text).cards as ResultCard[];
console.log(`cards in room: ${cards.length}`);
console.log(`hash matches posted: ${cards[0]?.hash === good.hash}`);
console.log(`agreement on the card: ${cards[0]?.agreement}`);

line("(c) post_result_card — forged hash");
const forgedHash = { ...signedCard("room-mcp-forged-hash", keys), hash: `sha256:${"0".repeat(64)}` };
const cResult = await call(client, "post_result_card", { card: forgedHash });
console.log(`isError: ${cResult.isError}`);
console.log(cResult.text);

line("(d) post_result_card — forged signature");
const forgedSig = { ...signedCard("room-mcp-forged-sig", keys), sig: "bm90LWEtc2lnbmF0dXJl" };
const dResult = await call(client, "post_result_card", { card: forgedSig });
console.log(`isError: ${dResult.isError}`);
console.log(dResult.text);

line("the two refused rooms must not exist");
const refused = await call(client, "list_rooms", {});
const refusedRooms = (JSON.parse(refused.text).rooms as Array<{ room_id: string }>).map((r) => r.room_id);
console.log(`room-mcp-forged-hash present: ${refusedRooms.includes("room-mcp-forged-hash")}`);
console.log(`room-mcp-forged-sig present:  ${refusedRooms.includes("room-mcp-forged-sig")}`);

line("signing with a DIFFERENT key — the issuer must not be borrowable");
const otherKeys = generateAgentKeyPair();
const impostor = signedCard("room-mcp-impostor", otherKeys);
// Keep the claimed author, swap in a signature made by a key we do not own.
const impostorCard: ResultCard = { ...impostor, author: keys.publicKeyRaw };
const iResult = await call(client, "post_result_card", { card: impostorCard });
console.log(`isError: ${iResult.isError}`);
console.log(iResult.text);

line("(WS-15) issuer public key directory");
const dir = await (await fetch(keysUrl)).json();
console.log(`url: ${keysUrl}`);
console.log(`keys advertised: ${dir.keys.length}`);
console.log(`issuers: ${JSON.stringify(dir.issuers)}`);
const served = dir.keys.find((k: { kid: string }) => k.kid === keys.publicKeyRaw);
console.log(`the issuer that just posted is in the directory: ${Boolean(served)}`);
if (served) {
  console.log(`jwk: ${JSON.stringify(served.publicKeyJwk)}`);
}

line("CORS — preflight and exposed headers");
const preflight = await fetch(gateUrl, { method: "OPTIONS" });
console.log(`OPTIONS status: ${preflight.status}`);
console.log(`allow-methods: ${preflight.headers.get("access-control-allow-methods")}`);
console.log(`expose-headers: ${preflight.headers.get("access-control-expose-headers")}`);
const initialized = await fetch(gateUrl, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cors-probe", version: "0.1.0" } } }),
});
console.log(`POST status: ${initialized.status}`);
console.log(`expose-headers on POST: ${initialized.headers.get("access-control-expose-headers")}`);
console.log(`allow-origin on POST: ${initialized.headers.get("access-control-allow-origin")}`);

line("no login wall — a cold anonymous call works");
console.log(`GET /mcp without credentials: ${(await fetch(gateUrl)).status}`);
console.log(`GET / without credentials:    ${(await fetch(`${base}/`)).status}`);

await client.close();
