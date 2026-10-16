"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";

interface ClaimAssessment {
  key: string;
  level: string;
  status: string;
  label: string;
}

interface Assessment {
  level: string;
  keyAuthenticated: boolean;
  lapsed: boolean;
  claims: ClaimAssessment[];
}

interface AgentCard {
  agent_id: string;
  display_name: string;
  owner: { name: string; contact: string | null };
  owner_policy: { may_disclose: string[]; must_not_disclose: string[] };
  claims: Record<string, { status: string; note?: string }>;
  sig: string;
}

interface CardResponse {
  card: AgentCard;
  assessment: Assessment;
}

const STATUS_TONE = {
  evidence: "green",
  self_reported: "amber",
  unverified: "neutral",
} as const;

/** What each claim means to a person deciding whether to trust this agent. */
const CLAIM_LABEL: Record<string, string> = {
  key_control: "Messages are signed by this agent's key",
  owner_binding: "Owner controls the contact address",
  capability_probe: "Can actually do what it says",
  screening: "Passed the background check",
};

const STATUS_WORD: Record<string, string> = {
  evidence: "Verified",
  self_reported: "Self-reported",
  unverified: "Not verified",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      <input
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export default function AgentEditorPage() {
  const [displayName, setDisplayName] = useState("Acme Buyer Agent");
  const [ownerName, setOwnerName] = useState("Acme Corp");
  const [ownerContact, setOwnerContact] = useState("procurement@acme.example");
  const [capabilities, setCapabilities] = useState("negotiate-price, verify-spec");
  const [mayDisclose, setMayDisclose] = useState("spec, quantity, target-price-range");
  const [mustNot, setMustNot] = useState("walk-away-price, internal-cost-basis");
  const [ownerBinding, setOwnerBinding] = useState(true);
  const [probe, setProbe] = useState(true);
  const [screening, setScreening] = useState(true);

  const [data, setData] = useState<CardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const split = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  async function build() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          owner_name: ownerName,
          owner_contact: ownerContact,
          capabilities: split(capabilities),
          may_disclose: split(mayDisclose),
          must_not_disclose: split(mustNot),
          levels: { owner_binding: ownerBinding, capability_probe: probe, screening },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as CardResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your agent</h1>
        <p className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
          Agent card editor: describe the agent that negotiates for you. Other companies&apos;
          agents read this card to decide whether to trust it — so every check shows
          whether it is verified or just claimed.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <Field label="Agent name" value={displayName} onChange={setDisplayName} />
          <Field label="Company" value={ownerName} onChange={setOwnerName} />
          <Field label="Contact email" value={ownerContact} onChange={setOwnerContact} />
          <Field
            label="What it can do"
            value={capabilities}
            onChange={setCapabilities}
            hint="Comma-separated, e.g. negotiate-price, verify-spec"
          />

          <details className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <summary className="cursor-pointer font-medium text-neutral-700 dark:text-neutral-300">
              Advanced — privacy and checks
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <Field
                label="May share with other agents"
                value={mayDisclose}
                onChange={setMayDisclose}
              />
              <Field label="Must never share" value={mustNot} onChange={setMustNot} />
              <div className="flex flex-col gap-2">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  Checks to back with evidence
                </span>
                {[
                  ["Prove we own the contact address", ownerBinding, setOwnerBinding] as const,
                  ["Test that it can do what it says", probe, setProbe] as const,
                  ["Run a background check", screening, setScreening] as const,
                ].map(([label, val, set]) => (
                  <label key={label} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={val}
                      onChange={(e) => set(e.target.checked)}
                      className="size-4"
                    />
                    <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </details>

          <Button onClick={build} disabled={loading} className="py-2">
            {loading ? "Creating…" : "Create agent card"}
          </Button>
          {error && <p className="text-sm text-rose-600">Couldn&apos;t create the card: {error}</p>}
        </div>

        <div className="flex flex-col gap-4">
          {data ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                  {data.card.display_name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold">{data.card.display_name}</div>
                  <div className="text-sm text-neutral-500">{data.card.owner.name}</div>
                </div>
              </div>
              <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900">
                {data.assessment.claims.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {CLAIM_LABEL[c.key] ?? c.key}
                    </span>
                    <Badge tone={STATUS_TONE[c.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                      {STATUS_WORD[c.status] ?? c.label}
                    </Badge>
                  </li>
                ))}
              </ul>
              <details className="text-xs text-neutral-500">
                <summary className="cursor-pointer">Signed card (JSON)</summary>
                <p className="mt-2">
                  Trust level {data.assessment.level} · key authenticated:{" "}
                  {String(data.assessment.keyAuthenticated)} · lapsed: {String(data.assessment.lapsed)}
                </p>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-neutral-100 p-3 text-[11px] leading-relaxed dark:bg-neutral-900">
                  {JSON.stringify(data.card, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
              Fill in the details and press <span className="font-medium">Create agent card</span>{" "}
              to see what other agents will see.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
