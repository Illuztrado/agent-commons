import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";
import { canonicalize } from "./canonical";

/**
 * Ed25519 keys for agents and humans.
 *
 * Wire format matches the transport (Muse Relay / Python `cryptography`):
 * raw 32-byte public keys, 64-byte signatures, base64url-encoded.
 * We use Node's built-in crypto so the skeleton has no extra crypto deps.
 */

const toB64u = (buf: Buffer) => buf.toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

export interface AgentKeyPair {
  /** base64url of the 32-byte Ed25519 public key = the agent id. */
  publicKeyRaw: string;
  privateKey: KeyObject;
}

export function generateAgentKeyPair(): AgentKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  return { publicKeyRaw: jwk.x as string, privateKey };
}

export function publicKeyFromRaw(publicKeyRaw: string): KeyObject {
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: publicKeyRaw },
    format: "jwk",
  });
}

export function publicRawFromPrivate(privateKey: KeyObject): string {
  const jwk = createPublicKey(privateKey).export({ format: "jwk" }) as JsonWebKey;
  return jwk.x as string;
}

export function exportPrivateJwk(privateKey: KeyObject): JsonWebKey {
  return privateKey.export({ format: "jwk" });
}

export function importPrivateJwk(jwk: JsonWebKey): KeyObject {
  return createPrivateKey({ key: jwk, format: "jwk" });
}

/** Sign any JSON value over its canonical form. Returns base64url. */
export function signValue(value: unknown, privateKey: KeyObject): string {
  const payload = Buffer.from(canonicalize(value), "utf8");
  return toB64u(sign(null, payload, privateKey));
}

/** Verify a base64url signature over the canonical form of `value`. */
export function verifyValue(
  value: unknown,
  signatureB64u: string,
  publicKeyRaw: string,
): boolean {
  try {
    const payload = Buffer.from(canonicalize(value), "utf8");
    return verify(null, payload, publicKeyFromRaw(publicKeyRaw), fromB64u(signatureB64u));
  } catch {
    return false;
  }
}

/** Strip a trailing `sig` field so the remainder is what gets signed. */
export function withoutSignature<T extends { sig?: string }>(obj: T): Omit<T, "sig"> {
  const { sig: _sig, ...rest } = obj;
  return rest;
}
