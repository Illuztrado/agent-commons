# Result card → W3C VC 2.0 mapping

Status: standard-anchoring doc for deck/README · 2026-10-16 · branch `wt/p9-vc`

## What this is — and what it is not

**Is:** a field-by-field mapping of our frozen result-card schema
(`src/lib/result-card.ts`) onto the shape of the W3C **Verifiable Credentials
Data Model 2.0**, plus a read-only export route
(`GET /api/result-card/[hash]/vc`, `src/lib/vc-export.ts`) that emits that shape.

**Is not:** a conformance claim. Everywhere in code and docs we say
**"VC 2.0-shaped"**, never "we are a VC". We emit no VC securing mechanism (no
Data Integrity `proof`, no VC-JOSE/COSE envelope), mint no DID, and publish no
JSON-LD vocabulary beyond the base context. A conforming VC must be secured by
at least one registered mechanism; our export is not, so it is not a
conforming VC — and the deck must not imply otherwise.

The frozen schema, the hash rule (`src/lib/canonical.ts`) and the Ed25519 wire
signature (`src/lib/keys.ts`) are unchanged by this work.

Standard of record: W3C VC Data Model 2.0 became a W3C **Recommendation on
2025-05-15**, together with Data Integrity 1.0, the EdDSA/ECDSA cryptosuites,
VC-JOSE/COSE, Controlled Identifiers 1.0 and Bitstring Status List 1.0.
The base context `https://www.w3.org/ns/credentials/v2` must be the first
`@context` entry.

## The exported shape

`GET /api/result-card/<hash>/vc` returns exactly five top-level keys:

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "type": ["VerifiableCredential", "AgentCommonsResultCard"],
  "issuer": { "id": "<author>" },
  "credentialSubject": { "...the result card, minus its sig..." },
  "sig": "<the card's wire signature, verbatim>"
}
```

`credentialSubject` is the card **as signed** — `withoutSignature(card)`,
identical bytes under the pinned canonical rule. That is deliberate: the
author's existing Ed25519 signature verifies against the export with the same
`canonical.ts` rule the product already uses, for single-card rooms (see the
merge caveat below).

## Mapping table

### Envelope (added by the export; not present on the card)

| Export field | VC 2.0 slot | Fidelity | Notes |
|---|---|---|---|
| `@context` | `@context` (required) | exact | The specification fixes `https://www.w3.org/ns/credentials/v2` as the first entry; we emit it and nothing else. Our private fields have no registered JSON-LD terms, so the export is not JSON-LD-processable beyond the base vocabulary. |
| `type` | `type` (required) | exact shape | `"VerifiableCredential"` is the required token; `"AgentCommonsResultCard"` is a **private marker**, not a registered type. |
| `issuer` | `issuer` (required) | **partial — documented mismatch** | VC 2.0 issuer is a URI (or an `{ "id": <URI> }` object). Our `author` is the agent id: base64url of a raw 32-byte Ed25519 public key — not a URI. We emit `{ "id": <author> }` and do **not** wrap it in `did:key:`, because that would imply a DID method we neither resolve nor publish. |
| `credentialSubject` | `credentialSubject` (required) | exact shape | The whole card minus `sig`, verbatim. VC 2.0 prescribes no inner shape for the subject, so every card field rides along inside it. We deliberately add no `credentialSubject.id`: the card has no URI identity for its subject (`room_id` is a demo label, not a URI). |
| `sig` | — (no standard slot) | **private property** | Kept verbatim as a top-level private field. VC 2.0 no longer defines `proof` in the core data model; securing is delegated to registered mechanisms (embedded: Data Integrity `proof` with a cryptosuite such as `eddsa-rdfc-2022`; enveloping: VC-JOSE/COSE). Our Ed25519-over-canonical-JSON signature is not one of those suites, so emitting `proof` would claim a suite we do not implement. |

### Card fields (all ride inside `credentialSubject`; none has a VC 2.0 counterpart)

| Result card field | VC 2.0 counterpart | Fidelity | Notes |
|---|---|---|---|
| `terms` | none reserved | private field | The negotiated payload. VC 2.0 has no reserved slot for arbitrary claims data beyond `credentialSubject` itself, which is where it lives. `credentialSchema` was **considered and rejected** as a way to declare the terms shape: we publish no machine-readable schema at a URL. |
| `hash` (`sha256:<hex>` over canonical terms) | none for sub-object digests | private field | VC 2.0 §5.3 (`relatedResource` → `digestMultibase` / `digestSRI`) is the closest standard digest concept, but it is defined for **external resources** with specific hash encodings, not for a sub-object of the credential itself. Considered and rejected; kept as a private field with its own name. |
| `room_id`, `scenario`, `summary`, `status`, `next_step` | none | private fields | No VC 2.0 vocabulary covers a negotiation room, its scenario, or a terminal step. |
| `participants`, `required_parties`, `agreed_by`, `agreement` | none | private fields | VC 2.0 has no multi-party consensus model: one issuer, one subject. `evidence` (a defined array-of-objects shape) was **considered and rejected** for `agreed_by`: stuffing our fields there would borrow the standard's name without its semantics. |
| `type: "result"`, `v: 1` | none | private fields | Our version markers. Kept because they sit inside the signed payload — removing them would break the author's signature. |
| `author` | mapped to `issuer` (above) | partial | Also remains inside `credentialSubject` for the same signed-bytes reason. |
| `sig` | mapped to the private top-level `sig` (above) | private | Removed from the subject so the subject equals the signed payload. |

### VC 2.0 fields we deliberately do **not** emit

Each omission below would be a claim we cannot back:

| VC 2.0 field | Why omitted |
|---|---|
| `id` | Optional in VC 2.0, and we have no URI. The terms hash is our addressing scheme — it is literally the route path. |
| `validFrom` / `validUntil` | The card carries no timestamps. We do not invent an issuance time. (A human sign-off has a timestamp, but that is a separate artifact, not the card.) |
| `credentialSchema` | No published schema URL to reference. |
| `credentialStatus` | No revocation service. The board is a live read of current state; there is nothing to revoke against. |
| `evidence` | Would borrow the standard's semantics for our agreement fields. See the table above. |
| `termsOfUse` / `refreshService` | Not applicable to this artifact. |
| `proof` (any cryptosuite) | Would claim a registered securing mechanism we do not implement. See the `sig` row above. |

## Signature semantics under merge — the honest caveat

The board, the room page and this route all show the **merged** card for a
hash: `agreed_by` is the union over every card posted for that hash
(`mergeResultCards`). A multi-party room posts one card per party, each signed
by its own author over its own `agreed_by` prefix. Therefore, for a hash with
more than one card:

- the embedded `sig` is the head card's signature, over the head card's own
  payload;
- it verifies against the exported `credentialSubject` **exactly when the head
  card's `agreed_by` already equals the union** — true for every single-card
  room (including every seed room), false once other parties' cards are merged
  in;
- to verify a merged export cryptographically, recompute against the author's
  own card (room data via the existing `Transport`), or verify each party's
  card individually.

For single-card rooms — the common demo case — the export's
`credentialSubject` is byte-identical to the signed payload and the signature
verifies as-is. Both directions are locked by `tests/vc-export.test.ts`.

## Bounded claims — what the deck and README may say

**May say:**

- "result cards can be exported in a VC 2.0-*shaped* envelope";
- "the terms hash is independently recomputable by any party";
- "for single-card rooms the author's Ed25519 signature verifies against the
  exported subject".

**Must not say:**

- "we are a Verifiable Credential", "W3C compliant", "VC interoperable",
  "standard signature", "decentralized identity". We emit no registered
  securing mechanism, no DID, and no JSON-LD vocabulary beyond the base
  context.

## References

- W3C VC Data Model 2.0 (Recommendation, 2025-05-15):
  https://www.w3.org/TR/vc-data-model-2.0/
- Base context: https://www.w3.org/ns/credentials/v2
- Code: `src/lib/result-card.ts` (frozen), `src/lib/canonical.ts`,
  `src/lib/keys.ts`, `src/lib/vc-export.ts`,
  `src/app/api/result-card/[hash]/vc/route.ts`
- Tests: `tests/vc-export.test.ts`
