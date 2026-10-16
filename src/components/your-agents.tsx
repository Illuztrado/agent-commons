"use client";

import { useEffect, useState } from "react";
import { Bot, Plus } from "lucide-react";
import { trustBadges, type TrustBadge } from "@/lib/trust-badges";
import { TrustBadges, TrustSummary } from "@/components/trust-badges";

/**
 * Your agents — the seeded buyer plus any agent you create here.
 *
 * Creating one signs a fresh agent card through POST /api/agent-card (the same
 * endpoint and checks as before). The server keeps no list of agents, so the
 * ones you create are remembered in this browser only.
 */

interface CardResponse {
  card: { agent_id: string; display_name: string; owner: { name: string } };
  assessment: { lapsed: boolean; claims: { key: string; status: string }[] };
}

export interface AgentSummary {
  id: string;
  name: string;
  company: string;
  role: string;
  badges: TrustBadge[];
}

const STORAGE_KEY = "agent-commons.created-agents";

function loadCreated(): AgentSummary[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AgentSummary[]) : [];
  } catch {
    return [];
  }
}

function saveCreated(agents: AgentSummary[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  } catch {
    // Private mode or blocked storage: the agent still shows until reload.
  }
}

const split = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      <input
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function AgentRow({ agent, highlight }: { agent: AgentSummary; highlight?: boolean }) {
  return (
    <div
      className={
        "flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 dark:bg-neutral-950 " +
        (highlight ? "border-sky-300 dark:border-sky-800" : "border-neutral-200 dark:border-neutral-800")
      }
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
        <Bot className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{agent.name}</div>
        <div className="text-xs text-neutral-500">
          {agent.company} · {agent.role}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <TrustBadges badges={agent.badges} />
        <TrustSummary badges={agent.badges} />
      </div>
    </div>
  );
}

export function YourAgents({ seeded }: { seeded: AgentSummary }) {
  const [created, setCreated] = useState<AgentSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("Acme Logistics Agent");
  const [company, setCompany] = useState(seeded.company);
  const [contact, setContact] = useState("logistics@acme.example");
  const [skills, setSkills] = useState("book-freight, compare-quotes");
  const [mayShare, setMayShare] = useState("route, weight, delivery-window");
  const [mustNot, setMustNot] = useState("budget-ceiling");
  const [ownerCheck, setOwnerCheck] = useState(true);
  const [skillsCheck, setSkillsCheck] = useState(false);
  const [screening, setScreening] = useState(false);

  // Read what this browser remembers once, after mount — localStorage is not
  // available during the server render.
  useEffect(() => {
    const stored = loadCreated();
    if (stored.length > 0) queueMicrotask(() => setCreated(stored));
  }, []);

  async function create() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: name,
          owner_name: company,
          owner_contact: contact,
          capabilities: split(skills),
          may_disclose: split(mayShare),
          must_not_disclose: split(mustNot),
          levels: { owner_binding: ownerCheck, capability_probe: skillsCheck, screening },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CardResponse;
      const agent: AgentSummary = {
        id: data.card.agent_id,
        name: data.card.display_name,
        company: data.card.owner.name,
        role: split(skills).join(", ") || "new agent",
        badges: trustBadges(data.assessment),
      };
      const next = [...created, agent];
      setCreated(next);
      saveCreated(next);
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function remove(id: string) {
    const next = created.filter((a) => a.id !== id);
    setCreated(next);
    saveCreated(next);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">
          Your agents <span className="font-normal text-neutral-500">· {1 + created.length}</span>
        </h2>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            <Plus className="size-4" aria-hidden="true" /> Create agent
          </button>
        )}
      </div>

      <AgentRow agent={seeded} highlight />
      {created.map((a) => (
        <div key={a.id} className="group relative">
          <AgentRow agent={a} />
          <button
            type="button"
            onClick={() => remove(a.id)}
            className="absolute -right-2 -top-2 hidden size-6 items-center justify-center rounded-full border border-neutral-300 bg-white text-xs text-neutral-500 group-hover:flex dark:border-neutral-700 dark:bg-neutral-900"
            aria-label={`Remove ${a.name}`}
          >
            ✕
          </button>
        </div>
      ))}

      {creating && (
        <div className="flex flex-col gap-4 rounded-2xl border border-sky-300 bg-white p-5 dark:border-sky-800 dark:bg-neutral-950">
          <div>
            <div className="font-semibold">New agent</div>
            <p className="text-xs text-neutral-500">
              Agent card editor — the card is signed when you create it. Checks you don&apos;t
              back with evidence show as only claimed.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Agent name" value={name} onChange={setName} />
            <Field label="Company" value={company} onChange={setCompany} />
            <Field label="Contact email" value={contact} onChange={setContact} />
            <Field label="What it can do" value={skills} onChange={setSkills} hint="Comma-separated" />
          </div>
          <details className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <summary className="cursor-pointer font-medium text-neutral-700 dark:text-neutral-300">
              Advanced — privacy and checks
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <Field label="May share with other agents" value={mayShare} onChange={setMayShare} />
              <Field label="Must never share" value={mustNot} onChange={setMustNot} />
              {[
                ["Prove we own the contact address", ownerCheck, setOwnerCheck] as const,
                ["Test that it can do what it says", skillsCheck, setSkillsCheck] as const,
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
          </details>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={create}
              disabled={loading || !name.trim()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create and sign"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-sm text-rose-600">Couldn&apos;t create the agent: {error}</p>}
        </div>
      )}

      {created.length > 0 && (
        <p className="text-xs text-neutral-500">
          Agents you create are kept in this browser only.
        </p>
      )}
    </section>
  );
}
