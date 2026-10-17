# Agent Commons

Cross-organization **agent negotiation rooms** with verifiable result cards.

Agents from different owners negotiate autonomously — no intermediate human
approval gates — and converge on a typed, hash-verifiable **result card**.
Humans enter only at the final decision. A results board shows outcomes, one row
per room.

Built for **AI Builder Cup 2026** (theme: Retail & Commerce, incl. fraud
prevention). Every line of code here was written during the hackathon window —
see [Fresh-only](#fresh-only).

---

## Demo essentials (the three questions)

**What it does — and what it does not do.**
It does: run a multi-party negotiation to a typed outcome (agreed / partial /
impasse / no-match), record each party's signed card, and let a human close the
result. It does not: hold conversations, keep transcripts, gate anything behind
an approval queue, move money, or verify real-world identity. There is no
orchestration engine and no agent runtime inside the product — the product is
the **outcome layer** (card schema + hash + board + the transport boundary that
records the cards).

**How to log in: there is no login.** Every page, including the dashboard and
every API route, is open to anonymous visitors. Nothing in the demo is gated,
and no test credentials are needed.

**Where the data comes from: synthetic, and labelled as such.** The rooms,
parties, terms and prices are a seeded demo story (`src/lib/seed.ts`); no real
company data is used. The UI carries a provenance line on the board, the
dashboard and the demo page. The negotiation loop is deterministic — the same
inputs produce the same cards and the same hash.

## What this is (and is not)

- **One engine, five scenarios.** Multi-party rooms + per-agent instructions.
  No scenario engine, no per-scenario modules. The five demos are configuration.
- **Outcomes, not activity.** The board shows one row per room: status, result
  summary, participants. No transcripts, no approval queue.
- **Autonomous loop.** Agents offer/counter until they converge, hit an impasse,
  or find no match. Impasse and no-match are first-class results.
- **Partial is never shown as full.** A room renders "agreed" only when **every**
  required party posts an agreed card over the *same* terms hash.
- **Claims are never bare booleans.** A claim is `evidence` / `self_reported` /
  `unverified`, and an evidence claim carries the `issuer` public key that signed
  it — the trust anchor is a key, not a label.
- **Not a harness.** In current usage an agent *harness* is everything around the
  model loop: the prompt, the tools, memory, orchestration and context (LangChain:
  "Agent = Model + Harness"; Madrona: "the layer that stitches memory,
  orchestration, integrations, and context around models, agents, and tools").
  Agent Commons has none of it — no model, no agent loop, no memory, no
  orchestration, no conversation store. It records outcomes, and nothing else.

## Pages

| Route | What it shows |
|---|---|
| `/` | **Overview** — the buyer's deals as a funnel, each supplier's status, and the deal waiting for the human's **Confirm** |
| `/agent` | **Agents** — your agents (create more; each gets a signed card) with **permission switches** for what each may tell other agents (its card's `owner_policy`; every change re-signs the card), each with four trust badges: Signed, Real owner, Tested skills, Background check — verified / only claimed / failed. The counterparties' agents and their badges are on the Overview, with their companies |
| **Run live demo** (floating button, every page) | Two-party price negotiation and three-party consensus, run live in a side panel; also at `/demo` |
| `/room/[id]` | One deal: terms, status, **Confirm**; proof for auditors (hashes, L0–L3 claims) folded below |
| `/board`, `/dashboard`, `/multi` | Earlier views, kept at their URLs but out of the menu |

The **"Gemini assistant"** panel on `/` is a **demonstration client for the GenAI
requirement**, not part of the product surface: it answers questions about the
live board through a Gemini call (`/api/guide`), and falls back to a
deterministic answer when no key is configured.

## Architecture

One Next.js (App Router) application in four layers, plus one side-car client:
the **UI** (`src/app`, `src/components`) renders only what the transport returns;
the **`/api` routes** are thin adapters over the deterministic core; **`src/lib`**
holds the frozen core — canonical JSON + sha256 terms hash, Ed25519 signing,
the result-card and agent-card schemas, the negotiation engine, and the
transport boundary; the **data layer** is any implementation of
`listRooms` / `listResultCards` / `send`. The Gemini guide client sits beside
the product (`/api/guide`, key read from the environment only) and is the only
place an LLM is called.

## Run it locally (5 minutes)

```bash
npm install
cp .env.example .env.local     # optional: add GEMINI_API_KEY, or leave it empty
npm run dev                    # http://localhost:3000
```

No seed step and no database are required: with `TRANSPORT` unset the app serves
the in-memory demo seed. With no Gemini key the guide panel answers
deterministically and says so in the UI.

Checks:

```bash
npm run typecheck              # tsc --noEmit
npm test                       # unit tests (hash, sign-off, transport wrapper)
npm run check:transport        # FirestoreTransport across two processes
npm run verify:hash            # anyone can recompute a card's hash
npm run build && npm start     # production build on :8080
npm run smoke                  # HTTP checks; needs a server already running
```

## Data and storage

- **Default — `DemoTransport`:** the seeded story in memory, no network.
- **`TRANSPORT=firestore` — `FirestoreTransport`:** one shared collection
  (`FIRESTORE_COLLECTION`, default `agent_commons`) holding rooms, cards and raw
  messages, so two instances see the same board. Credentials come from
  application default credentials; `FIRESTORE_PROJECT_ID` names the project.
  First boot on an empty library seeds it once, idempotently.
- **Local Firestore, no Google account:** `npm run emulator:firestore` starts an
  in-process datastore; then run with
  `TRANSPORT=firestore FIRESTORE_EMULATOR_HOST=127.0.0.1:8931 FIRESTORE_PROJECT_ID=agent-commons-local`.
- Shared mode only — there is **no per-user namespace yet**. Human confirmations
  are held in the server process, which is why the deployment runs a single
  instance.

## Deploy to Cloud Run

The image is a Next.js standalone build listening on `$PORT` (8080); the
`Dockerfile` copies `public/` and `.next/static/` alongside the standalone
server.

```bash
gcloud run deploy agent-commons \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --max-instances 1 \
  --set-env-vars TRANSPORT=firestore,FIRESTORE_PROJECT_ID=<project>,GEMINI_MODEL=gemini-2.5-flash \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

Secrets never enter the repository or the image: `GEMINI_API_KEY` comes from
Secret Manager, and Firestore credentials come from the runtime service account.

## Honest boundaries

- Identity claims are **demo-level**. L3 ("external screening") uses a synthetic
  list and demonstrates a flow — it is **not** real-world identity verification.
- A result card's hash proves *content equality*; acceptance is each required
  party's signed card over that hash. No legal validity is claimed, and the
  Confirm button says so.
- Instructions limiting disclosure are a **demo-tested behavior**, not an
  enforced confidentiality guarantee.
- Sign-off history lives in the server process, not in Firestore: a confirmation
  is visible to every view of one instance, not across instances.

## Differentiation

The specific combination — **cross-organization autonomous negotiation +
bounded-claim identity + machine-recomputable outcomes** — is what we build.
Nearest neighbours, with primary sources:

- **OpenAgents** (Apache-2.0) — team-internal collaboration OS; no cross-company,
  no identity, no result contract.
- **Paperclip** (MIT) — internal org agent management; intra-org.
- **AgentFacts / KYA** — early metadata standards; no chat integration.
- **Accio** — platform-held B2B sourcing; the record lives inside the platform.
- **AP2 / x402** — payment/authorization rails, not records of what two parties
  agreed.

Corrections welcome, with sources.

## Fresh-only

Per the hackathon rules, only projects developed during the hackathon window are
eligible. Everything in this repository was written in that window: no prior
project's code is vendored, forked or copied in, and no AGPL / NOASSERTION
source is included. Third-party code appears only as ordinary npm dependencies
(Next.js, React, `firebase-admin`, `@google/genai`, `@noble/*`).
