import { TwoCompanies, ThreeFriends } from "@/components/live-demos";
import { DATA_PROVENANCE } from "@/lib/scenarios";

/** The live demos on a page of their own; the same panels open from the floating demo button. */
export default function DemoPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Live demo</h1>
        <p className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
          Live negotiation between independent agents. Pick a setup and they negotiate on
          their own — a person only steps in at the end to confirm.
        </p>
      </header>
      <TwoCompanies />
      <ThreeFriends />
      <footer className="text-xs text-neutral-500">{DATA_PROVENANCE}</footer>
    </main>
  );
}
