import type { ReactNode } from "react";
import type { Candidate, Example } from "../lib/types";
import MinibatchPanel from "./MinibatchPanel";
import ParetoGrid from "./ParetoGrid";
import PromptSection from "./PromptSection";

type RenderLink = (to: string, children: ReactNode) => ReactNode;

const defaultRenderLink: RenderLink = (to, children) => (
  <a href={to} className="underline">
    {children}
  </a>
);

type Props = {
  id: string;
  candidate: Candidate;
  parent: Candidate | null;
  examples: Example[];
  /** Render a navigation link. Defaults to a plain <a href>. */
  renderLink?: RenderLink;
};

export default function CandidateView({
  id,
  candidate,
  parent,
  examples,
  renderLink = defaultRenderLink,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <nav className="mb-6 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          {renderLink("/", "← back to graph")}
        </span>
        <div className="text-xs text-zinc-500">
          {candidate.parent === null ? (
            <>root candidate</>
          ) : (
            <>
              parent:{" "}
              {renderLink(
                `/candidate/${candidate.parent}`,
                `candidate ${candidate.parent}`,
              )}
            </>
          )}
        </div>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          candidate {id}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {candidate.score !== null
            ? `valset score: ${(candidate.score * 100).toFixed(2)}% (${valCorrect(candidate)}/${examples.length})`
            : "rejected on minibatch — not evaluated on valset"}
        </p>
      </header>

      <Section title="pareto frontier on valset">
        {candidate.predictions ? (
          <ParetoGrid examples={examples} predictions={candidate.predictions} />
        ) : (
          <div className="rounded-md border border-dashed border-zinc-400 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900">
            this candidate was rejected on its minibatch and was not evaluated
            on the valset, so it has no pareto frontier data.
          </div>
        )}
      </Section>

      <PromptSection
        prompt={candidate.prompt}
        parentPrompt={parent?.prompt ?? null}
      />

      {candidate.minibatch && (
        <Section title="reflection minibatch + feedback">
          <MinibatchPanel entries={candidate.minibatch} />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function valCorrect(c: Candidate): number {
  if (c.predictions === null) return 0;
  return c.predictions.filter((p) => p.score > 0).length;
}
