import { DemoTransport, type Transport } from "./transport";
import { FirestoreTransport } from "./firestore-transport";

/**
 * Transport selection for the room layer.
 *
 * `TRANSPORT=firestore` opts into the shared Firestore channel; anything else
 * — unset, empty, a typo — keeps the in-memory DemoTransport seed, so the board
 * always renders and never silently half-reaches a database.
 *
 * This lives apart from transport.ts on purpose: transport.ts stays the frozen
 * boundary (interface + demo behaviour), and exactly one place decides which
 * implementation a page gets.
 */

export type TransportKind = "demo" | "firestore";

export function transportKind(): TransportKind {
  return process.env.TRANSPORT?.trim().toLowerCase() === "firestore" ? "firestore" : "demo";
}

let singleton: Transport | null = null;
let singletonKind: TransportKind | null = null;

export function getTransport(): Transport {
  const kind = transportKind();
  if (singleton && singletonKind === kind) return singleton;
  singleton = kind === "firestore" ? new FirestoreTransport() : new DemoTransport();
  singletonKind = kind;
  return singleton;
}
