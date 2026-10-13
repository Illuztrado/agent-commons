/**
 * Independent hash recomputation demo.
 *
 * Shows that any party — in any language — can recompute a result card's
 * hash from `terms` alone, with no access to our code beyond the pinned
 * canonicalisation rule. This is the "verifiable outcome" claim, made testable.
 */
import { createHash } from "node:crypto";

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      out[key] = sortValue(value[key]);
    }
    return out;
  }
  return value;
}

const canonicalize = (value) => JSON.stringify(sortValue(value));

const termsHash = (terms) =>
  "sha256:" + createHash("sha256").update(canonicalize(terms), "utf8").digest("hex");

// Same terms, deliberately scrambled key order — must hash identically.
const a = { spec: "A-100", quantity: 5000, unit_price: 4.05, lead_time_days: 21 };
const b = { lead_time_days: 21, unit_price: 4.05, spec: "A-100", quantity: 5000 };

console.log("canonical(a) =", canonicalize(a));
console.log("hash(a)      =", termsHash(a));
console.log("hash(b)      =", termsHash(b));

if (termsHash(a) !== termsHash(b)) {
  throw new Error("canonicalisation is not order-independent");
}
console.log("OK: hash is stable and independently recomputable");
