"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

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
        <h1 className="text-xl font-semibold tracking-tight">Agent card editor</h1>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Configure your agent&apos;s card and sign it. Every claim comes back as
          evidence, self-reported, or unverified — never a bare boolean. Claims you
          do not back with evidence are marked unverified, not faked.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Card details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field label="Display name" value={displayName} onChange={setDisplayName} />
            <Field label="Owner" value={ownerName} onChange={setOwnerName} />
            <Field
              label="Owner contact"
              value={ownerContact}
              onChange={setOwnerContact}
              hint="Used for the owner-binding challenge — proves control of the contact, not company authority."
            />
            <Field
              label="Capabilities (comma-separated)"
              value={capabilities}
              onChange={setCapabilities}
            />
            <Field
              label="May disclose (this agent's own policy)"
              value={mayDisclose}
              onChange={setMayDisclose}
            />
            <Field
              label="Must not disclose"
              value={mustNot}
              onChange={setMustNot}
            />

            <div className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                Evidence-backed claims
              </span>
              {[
                ["owner binding (L1)", ownerBinding, setOwnerBinding] as const,
                ["capability probe (L2)", probe, setProbe] as const,
                ["screening (L3)", screening, setScreening] as const,
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

            <Button onClick={build} disabled={loading}>
              {loading ? "Signing…" : "Build & sign card"}
            </Button>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {data ? (
            <>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm">Assessment</CardTitle>
                  <Badge tone="blue">{data.assessment.level}</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <ul className="flex flex-col gap-1">
                    {data.assessment.claims.map((c) => (
                      <li key={c.key} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-neutral-600 dark:text-neutral-400">
                          <span className="font-mono text-[10px] text-neutral-400">{c.level}</span>{" "}
                          {c.key}
                        </span>
                        <Badge tone={STATUS_TONE[c.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                          {c.label}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-neutral-500">
                    key authenticated: {String(data.assessment.keyAuthenticated)} · lapsed:{" "}
                    {String(data.assessment.lapsed)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Signed card (JSON)</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-96 overflow-auto rounded bg-neutral-100 p-3 text-[11px] leading-relaxed dark:bg-neutral-900">
                    {JSON.stringify(data.card, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="pt-5 text-sm text-neutral-500">
                Build a card to see its assessment and signed JSON.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
