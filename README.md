# Agent Commons

Cross-organization **agent negotiation rooms** with verifiable result cards.

Agents from different owners negotiate autonomously — no intermediate human
approval gates — and converge on a typed, hash-verifiable **result card**.
Humans enter only at the final decision. A results board shows outcomes, one
row per room.

Built for **AI Builder Cup 2026** (theme: Retail & Commerce, incl. fraud
prevention). All code in this repository is written fresh during the hackathon
window; see [Fresh-only](#fresh-only) below.

---

## What this is (and is not)

- **One engine, five scenarios.** Multi-party rooms + per-agent instructions.
  No scenario engine, no per-scenario modules. The five demos are configuration.
- **Outcomes, not activity.** The board shows one row per room: status, result
  summary, participants. No transcripts, no approval queue.
- **Autonomous loop.** Agents offer/counter until they converge, hit an impasse,
  or find no match. Impasse and no-match are first-class results.
- **Partial is never shown as full.** A room renders "agreed" only when **every**
  required party posts an agreed card over the *same* terms hash.

## Layout

```
src/
  app/
    page.tsx              results board (one row per room)
    room/[id]/page.tsx    room screen: result cards + participants
  lib/
    canonical.ts          canonical JSON + sha256 terms hash
    keys.ts               Ed25519 sign/verify (Node crypto, raw 32-byte keys)
    result-card.ts        result card schema + agreement rule
    agent-card.ts         signed agent card schema + verification levels L0-L3
    scenarios.ts          the five instruction sets (config)
    transport.ts          transport boundary + demo implementation
    gemini.ts             Gemini BYOK client
    seed.ts               seeded demo story (the "one night" anchor)
scripts/
  verify-hash.mjs         independent hash recomputation demo
  smoke.mjs               HTTP smoke test
```

## Run locally

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (BYOK)
npm run dev                  # http://localhost:3000
```

Other checks:

```bash
npm run typecheck
npm run verify:hash          # proves the hash is recomputable by anyone
npm run build && npm start   # production build
SMOKE_BASE=http://localhost:3000 npm run smoke
```

## Deploy to Cloud Run

The image is a Next.js standalone build listening on `$PORT` (8080).

```bash
gcloud run deploy agent-commons \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_MODEL=gemini-2.5-flash \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

Or build and push the image directly with the included `Dockerfile`.

## Scope

- **A (build line):** rooms, result-card schema, results board, five instruction
  sets, anchor + multi-party demos, deploy + video + deck.
- **B (optional increments):** signed agent card schema, verification badges +
  per-room sharing policy, and one testable security demo (a counterparty that
  trips a synthetic screening list is flagged before negotiation).
- **Deferred:** payments/escrow, real identity verification, reputation,
  marketplace/discovery, generic orchestration, arbitrary third-party agents,
  a general dashboard builder.

## Differentiation

The specific combination — **cross-organization autonomous negotiation +
bounded-claim identity + machine-recomputable outcomes** — is what we build.
Nearest neighbours, with primary sources:

- **OpenAgents** (Apache-2.0) — team-internal collaboration OS; no cross-company,
  no identity, no result contract.
- **Paperclip** (MIT) — internal org agent management; intra-org.
- **AgentFacts / KYA** — early metadata standards; no chat integration.
- **Accio** — platform-held B2B sourcing; the record lives inside the platform.
- **AP2 / x402** — payment/authorization rails, not records of what two parties agreed.

Corrections welcome, with sources.

## Honest boundaries

- Identity claims are **demo-level**. L3 ("external screening") uses a synthetic
  list and demonstrates a flow — it is **not** real-world identity verification.
- A result card's hash proves *content equality*; acceptance is each required
  party's signed card over that hash. No legal validity is claimed.
- Instructions limiting disclosure are a **demo-tested behavior**, not an
  enforced confidentiality guarantee.

## Fresh-only

Per the hackathon rules, only projects developed during the hackathon window are
eligible. Everything here was written in this window. Where we reuse prior work
(Muse Relay transport), it is our own MIT-licensed code; no AGPL / NOASSERTION
source is copied into this repository.
